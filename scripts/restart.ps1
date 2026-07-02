# 一键联调重启（Windows）
# 用法: .\scripts\restart.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$DockerBin = "C:\Program Files\Docker\Docker\resources\bin"
$Docker = Join-Path $DockerBin "docker.exe"
$DaemonPath = Join-Path $env:USERPROFILE ".docker\daemon.json"

if (-not (Test-Path $Docker)) {
    Write-Host "[错误] 未安装 Docker Desktop。" -ForegroundColor Red
    exit 1
}
$env:Path = "$DockerBin;" + $env:Path

# 读取阿里云加速地址
$mirror = ""
$envFile = Join-Path $Root ".env.docker"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^ALIYUN_MIRROR=(.+)$') { $mirror = $Matches[1].Trim() }
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AI-SE Assistant - 联调重启" -ForegroundColor Cyan
if ($mirror -and $mirror -notmatch 'YOUR_ID') {
    Write-Host " 阿里云加速: $mirror" -ForegroundColor Cyan
} else {
    Write-Host " 未配置阿里云加速（编辑 .env.docker）" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Cyan

# 0. 若已配置阿里云地址，写入 daemon.json
if ($mirror -and $mirror -notmatch 'YOUR_ID') {
    $dockerDir = Split-Path $DaemonPath
    if (-not (Test-Path $dockerDir)) {
        New-Item -ItemType Directory -Path $dockerDir | Out-Null
    }
    $needRestart = $true
    if (Test-Path $DaemonPath) {
        try {
            $existing = Get-Content $DaemonPath -Raw | ConvertFrom-Json
            if ($existing.'registry-mirrors' -contains $mirror) {
                $needRestart = $false
            }
        } catch { }
    }
    if ($needRestart) {
        $config = @{ "registry-mirrors" = @($mirror) } | ConvertTo-Json -Depth 3
        Set-Content -Path $DaemonPath -Value $config -Encoding UTF8
        Write-Host "`n[提示] 已更新 Docker 镜像加速，请重启 Docker Desktop 后再运行本脚本。" -ForegroundColor Yellow
        Write-Host "  Docker Desktop -> Settings -> Restart" -ForegroundColor Gray
        exit 0
    }
}

# 1. 检查 Docker
Write-Host "`n[1/5] 检查 Docker..." -ForegroundColor Yellow
& $Docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Start-Process "C:\Program Files\Docker\Docker\resources\bin\..\..\Docker Desktop.exe"
    for ($i = 1; $i -le 24; $i++) {
        Start-Sleep -Seconds 5
        & $Docker info 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
    }
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] Docker 未就绪，请打开 Docker Desktop 后重试。" -ForegroundColor Red
    exit 1
}
Write-Host "OK" -ForegroundColor Green

# 2. 停止旧容器
Write-Host "`n[2/5] 停止旧容器..." -ForegroundColor Yellow
Push-Location $Root
& $Docker compose -f docker-compose.db.yml down 2>$null
& $Docker compose down 2>$null
Write-Host "OK" -ForegroundColor Green

# 3. 拉取镜像（官方名，走 daemon 加速）
Write-Host "`n[3/5] 拉取 postgres + redis..." -ForegroundColor Yellow
& $Docker pull "postgres:16-alpine"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] postgres 拉取失败。请配置 .env.docker 中 ALIYUN_MIRROR 并重启 Docker。" -ForegroundColor Red
    Pop-Location; exit 1
}
& $Docker pull "redis:7-alpine"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] redis 拉取失败。" -ForegroundColor Red
    Pop-Location; exit 1
}
Write-Host "OK" -ForegroundColor Green

# 4. 启动数据库
Write-Host "`n[4/5] 启动 PostgreSQL + Redis..." -ForegroundColor Yellow
& $Docker compose -f docker-compose.db.yml up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 数据库启动失败。" -ForegroundColor Red
    Pop-Location; exit 1
}
Start-Sleep -Seconds 8
& $Docker compose -f docker-compose.db.yml ps
Write-Host "OK" -ForegroundColor Green
Pop-Location

# 5. 初始化后端数据库
Write-Host "`n[5/5] 初始化后端数据库..." -ForegroundColor Yellow
Push-Location "$Root\backend"
if (-not (Test-Path ".venv")) {
    python -m venv .venv
    .\.venv\Scripts\pip.exe install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple -q
}
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
}
& .\.venv\Scripts\python.exe -m app.init_db
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] init_db 失败，请检查 backend/.env" -ForegroundColor Red
    Pop-Location; exit 1
}
Write-Host "OK" -ForegroundColor Green
Pop-Location

Write-Host "`n========================================" -ForegroundColor Green
Write-Host " 就绪！在 2 个终端分别启动：" -ForegroundColor Green
Write-Host ""
Write-Host " 终端 1（后端）：" -ForegroundColor White
Write-Host "   cd backend" -ForegroundColor Gray
Write-Host "   .\.venv\Scripts\uvicorn.exe app.main:app --reload" -ForegroundColor Gray
Write-Host ""
Write-Host " 终端 2（前端）：" -ForegroundColor White
Write-Host "   cd frontend" -ForegroundColor Gray
Write-Host "   npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host " 打开: http://localhost:3000" -ForegroundColor Cyan
Write-Host " 登录: admin / admin123456" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Green
