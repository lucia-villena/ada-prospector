# Compila el conocimiento de ADA Prospector (no requiere Node ni nada instalado: corre con PowerShell de Windows).
# Lee knowledge/manifest.json, extrae secciones del MAESTRO y del NUCLEO, suma los archivos locales
# y genera netlify/functions/lib/knowledge.generated.mjs. Los originales NO se modifican.
# Uso (desde la carpeta ada-prospector):  powershell -ExecutionPolicy Bypass -File tools\build-knowledge.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$kdir = Join-Path $root 'knowledge'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-Utf8([string]$path) { [System.IO.File]::ReadAllText($path, $utf8) }

$manifest = (Read-Utf8 (Join-Path $kdir 'manifest.json')) | ConvertFrom-Json

# --- Parser de secciones -------------------------------------------------------------------
# '## ...' abre una seccion de nivel superior que incluye a sus '### ...'.
# '### ...' abre una subseccion que termina en el proximo '##' o '###'.
function Get-Sections([string]$text, [string]$kind) {
    $top = @{}; $sub = @{}
    $curTop = $null; $curSub = $null
    foreach ($line in ($text -split "`r?`n")) {
        $id = $null; $level = 0
        if ($line -match '^(#{2,3}) (.+)$') {
            $level = $Matches[1].Length
            $title = $Matches[2]
            if ($kind -eq 'maestro') {
                if ($title -match '^(Parte [A-G0])\b') { $id = $Matches[1] }
                elseif ($title -match '^([A-G]\.\d+)\b') { $id = $Matches[1] }
                elseif ($title -match '^(Anexo)\b') { $id = $Matches[1] }
            } else {
                if ($title -match '^(N\d+(?:\.\d+)?)\b') { $id = $Matches[1] }
            }
        }
        if ($level -eq 2) {
            $curSub = $null
            $curTop = $id
            if ($id) { $top[$id] = New-Object System.Collections.Generic.List[string] }
        } elseif ($level -eq 3) {
            $curSub = $id
            if ($id) { $sub[$id] = New-Object System.Collections.Generic.List[string] }
        }
        if ($level -eq 2 -and $id) { $top[$id].Add($line); continue }
        if ($level -eq 3) {
            if ($curTop -and $top.ContainsKey($curTop)) { $top[$curTop].Add($line) }
            if ($id) { $sub[$id].Add($line) }
            continue
        }
        if ($curTop -and $top.ContainsKey($curTop)) { $top[$curTop].Add($line) }
        if ($curSub -and $sub.ContainsKey($curSub)) { $sub[$curSub].Add($line) }
    }
    return @{ top = $top; sub = $sub }
}

function Get-Section($parsed, [string]$id, [string]$srcName) {
    if ($parsed.top.ContainsKey($id)) { return ($parsed.top[$id] -join "`n") }
    if ($parsed.sub.ContainsKey($id)) { return ($parsed.sub[$id] -join "`n") }
    throw "No se encontro la seccion '$id' en $srcName. Revisar knowledge/manifest.json"
}

# --- Limpieza del texto --------------------------------------------------------------------
function Clean-Text([string]$t) {
    # referencias internas de origen ([M A.5], [F06 s47], [Decision ...]) no le sirven a la IA ni al alumno
    $t = $t -replace '\s*\[(?:M [^\]]*|F\d\d[^\]]*|Decisi[^\]]*)\]', ''
    $t = $t -replace '\s+(en|de|ver|Ver|segun)\s+([\.\,\;\)])', '$2'
    # Decision del equipo: las "ordenes fantasma" (B.11) no se usan (ver N1.17)
    $t = $t -replace 'Orden fantasma \(.*?\): m.ximo 3 cancelaciones por d.a y nunca mientras farme.s el verificado\.', ''
    $t = $t -replace '\| \*\*Pesca / anuncio de pesca / orden fantasma\*\* \|[^\r\n]*', '| **Pesca / anuncio de pesca** | Anuncio con precio muy favorable dejado esperando a ver si cae algo |'
    $t = $t -replace "(\r?\n){3,}", "`n`n"
    return $t.Trim()
}

# --- Fuentes -------------------------------------------------------------------------------
$parsed = @{}
foreach ($name in @('maestro', 'nucleo')) {
    $p = [System.IO.Path]::GetFullPath((Join-Path $root $manifest.sources.$name))
    if (-not (Test-Path $p)) { throw "No existe la fuente $name en $p" }
    $parsed[$name] = Get-Sections (Read-Utf8 $p) $name
    Write-Host ("Fuente {0}: {1} secciones" -f $name, ($parsed[$name].top.Count + $parsed[$name].sub.Count))
}

function Build-Module($mod) {
    $chunks = New-Object System.Collections.Generic.List[string]
    foreach ($part in $mod.parts) {
        if ($part.PSObject.Properties.Name -contains 'local') {
            $chunks.Add((Read-Utf8 (Join-Path $kdir ('local/' + $part.local))))
        }
        foreach ($src in @('maestro', 'nucleo')) {
            if ($part.PSObject.Properties.Name -contains $src) {
                foreach ($id in $part.$src) { $chunks.Add((Get-Section $parsed[$src] $id $src)) }
            }
        }
    }
    return (Clean-Text ($chunks -join "`n`n"))
}

$modules = [ordered]@{}
foreach ($prop in $manifest.modules.PSObject.Properties) {
    $modules[$prop.Name] = Build-Module $prop.Value
}

$modes = [ordered]@{}
foreach ($prop in $manifest.modes.PSObject.Properties) {
    $m = $prop.Value
    $entry = [ordered]@{
        modulos     = @($m.modulos)
        instruccion = (Clean-Text (Read-Utf8 (Join-Path $kdir ('local/' + $m.instruccion))))
        verificar   = [bool]$m.verificar
        esfuerzo    = [string]$m.esfuerzo
    }
    if ($m.PSObject.Properties.Name -contains 'esfuerzoEvaluacion') { $entry.esfuerzoEvaluacion = [string]$m.esfuerzoEvaluacion }
    if ($m.PSObject.Properties.Name -contains 'verificarEvaluacion') { $entry.verificarEvaluacion = [bool]$m.verificarEvaluacion }
    if ($m.PSObject.Properties.Name -contains 'maxTokens') { $entry.maxTokens = [int]$m.maxTokens }
    if ($m.PSObject.Properties.Name -contains 'maxTokensEvaluacion') { $entry.maxTokensEvaluacion = [int]$m.maxTokensEvaluacion }
    $modes[$prop.Name] = $entry
}

# --- Salida --------------------------------------------------------------------------------
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('// ARCHIVO GENERADO por tools/build-knowledge.ps1. No editar a mano.')
[void]$sb.AppendLine('export const BUILT_AT = ' + (ConvertTo-Json -InputObject ((Get-Date).ToString('s'))) + ';')
[void]$sb.AppendLine('export const MODULES = ' + (ConvertTo-Json -InputObject $modules -Depth 4) + ';')
[void]$sb.AppendLine('export const MODES = ' + (ConvertTo-Json -InputObject $modes -Depth 4) + ';')
$outDir = Join-Path $root 'netlify/functions/lib'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir 'knowledge.generated.mjs'
[System.IO.File]::WriteAllText($out, $sb.ToString(), $utf8)

Write-Host ''
Write-Host 'Modulo                 caracteres   tokens aprox.'
foreach ($k in $modules.Keys) {
    $len = $modules[$k].Length
    Write-Host ('{0,-22} {1,10} {2,14}' -f $k, $len, [int]($len / 3.6))
}
Write-Host ''
Write-Host "Generado: $out"
