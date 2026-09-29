# Servidor estatico minimo, SOLO para revisar la interfaz en local (no hace falta para usar ni desplegar la app).
# Uso: powershell -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 8888   ->  http://localhost:8888/?demo=1
param([int]$Port = 8888)

$root = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) 'public'))
$projectRoot = Split-Path -Parent $PSScriptRoot
$libRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'netlify\functions\lib'))
$testRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'tools'))
$mime = @{
    '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
    '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Sirviendo $root en http://localhost:$Port/"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
        if ($path -eq '/') { $path = '/index.html' }
        $base = $root
        # Rutas solo de desarrollo para probar la logica del servidor en el navegador
        if ($path.StartsWith('/__lib/')) { $base = $libRoot; $path = $path.Substring(6) }
        elseif ($path.StartsWith('/__test/')) { $base = $testRoot; $path = $path.Substring(7) }
        $full = [System.IO.Path]::GetFullPath((Join-Path $base $path.TrimStart('/')))
        if ($full.StartsWith($base) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $ext = [System.IO.Path]::GetExtension($full).ToLower()
            $ctx.Response.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
            $ctx.Response.Headers.Add('Cache-Control', 'no-store')
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $ctx.Response.StatusCode = 404
        }
    } catch {
        $ctx.Response.StatusCode = 500
    } finally {
        $ctx.Response.Close()
    }
}
