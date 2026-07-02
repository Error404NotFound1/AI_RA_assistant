# Docker 阿里云镜像加速（Windows PowerShell）
# 用法:
#   .\scripts\docker_mirror.ps1 setup    # 写入 daemon.json（需重启 Docker Desktop）
#   .\scripts\docker_mirror.ps1 pull     # 拉取镜像（走加速器）
#   .\scripts\docker_mirror.ps1 up-db    # 仅启动 PostgreSQL + Redis
#   .\scripts\docker_mirror.ps1 up-all   # 启动全部服务
#   .\scripts\docker_mirror.ps1 status

param(
    [Parameter(Position = 0)]
    [ValidateSet("setup", "pull", "up-db", "up-all", "status")]
    [string]$Action = "pull"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$DockerBin = "C:\Program Files\Docker\Docker\resources\bin"
$DockerExe = Join-Path $DockerBin "docker.exe"
$EnvFile = Join-Path $Root ".env.docker"
$DaemonPath = Join-Path $env:USERPROFILE ".docker\daemon.json"

if (-not (Test-Path $DockerExe)) {
    Write-Host "未找到 Docker，请先安装 Docker Desktop。" -ForegroundColor Red
    exit 1
}

$env:Path = "$DockerBin;" + $env:Path

function Get-AliyunMirror {
    $mirror = ""
    if (Test-Path $EnvFile) {
        Get-Content $EnvFile | ForEach-Object {
            if ($_ -match '^ALIYUN_MIRROR=(.+)$') { $mirror = $Matches[1].Trim() }
        }
    }
    return $mirror
}

function Test-DockerReady {
    & $DockerExe info 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
}

if (-not (Test-DockerReady)) {
    Write-Host "正在启动 Docker Desktop..." -ForegroundColor Yellow
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
    for ($i = 1; $i -le 30; $i++) {
        if (Test-DockerReady) { break }
        Start-Sleep -Seconds 5
    }
    if (-not (Test-DockerReady)) {
        Write-Host "Docker 未就绪，请手动打开 Docker Desktop 后重试。" -ForegroundColor Red
        exit 1
    }
}

switch ($Action) {
    "setup" {
        $mirror = Get-AliyunMirror
        if (-not $mirror -or $mirror -match 'YOUR_ID') {
            Write-Host "请先在 .env.docker 中填写你的阿里云加速地址：" -ForegroundColor Red
            Write-Host "  https://cr.console.aliyun.com/cn-hangzhou/instances/mirrors" -ForegroundColor Yellow
            Write-Host "  ALIYUN_MIRROR=https://xxxxxx.mirror.aliyuncs.com" -ForegroundColor Yellow
            exit 1
        }
        $dockerDir = Split-Path $DaemonPath
        if (-not (Test-Path $dockerDir)) {
            New-Item -ItemType Directory -Path $dockerDir | Out-Null
        }
        if (Test-Path $DaemonPath) {
            $backup = "$DaemonPath.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
            Copy-Item $DaemonPath $backup
            Write-Host "已备份: $backup" -ForegroundColor Gray
        }
        # 部分网络环境下阿里云会偶发 403，这里额外加两个备用加速源，阿里云仍为第一优先级
        $mirrors = @(
            $mirror,
            "https://docker.m.daocloud.io",
            "https://docker.1ms.run"
        )
        $config = @{
            "registry-mirrors" = $mirrors
        } | ConvertTo-Json -Depth 3
        Set-Content -Path $DaemonPath -Value $config -Encoding UTF8
        Write-Host "已写入镜像加速（优先阿里云）: $mirror" -ForegroundColor Green
        Write-Host "请重启 Docker Desktop（设置 -> Restart）后执行 pull。" -ForegroundColor Yellow
    }

    "pull" {
        $mirror = Get-AliyunMirror
        if ($mirror -and $mirror -notmatch 'YOUR_ID') {
            Write-Host "使用阿里云加速: $mirror" -ForegroundColor Cyan
            Write-Host "若拉取仍慢，请先运行: .\scripts\docker_mirror.ps1 setup 并重启 Docker" -ForegroundColor Gray
        } else {
            Write-Host "未配置 ALIYUN_MIRROR，将直连 Docker Hub（可能很慢）" -ForegroundColor Yellow
        }
        $images = @(
            "postgres:16-alpine",
            "redis:7-alpine",
            "python:3.12-slim",
            "node:22-alpine"
        )
        foreach ($img in $images) {
            Write-Host ""
            Write-Host "拉取 $img ..." -ForegroundColor Yellow
            & $DockerExe pull $img
            if ($LASTEXITCODE -ne 0) {
                Write-Host "拉取失败: $img" -ForegroundColor Red
                Write-Host "请配置 .env.docker 后运行 setup 并重启 Docker Desktop" -ForegroundColor Yellow
                exit 1
            }
        }
        Write-Host ""
        Write-Host "镜像拉取完成。" -ForegroundColor Green
    }

    "up-db" {
        Push-Location $Root
        Write-Host "启动 PostgreSQL + Redis..." -ForegroundColor Cyan
        & $DockerExe compose -f docker-compose.db.yml up -d
        if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
        Pop-Location
        Write-Host "数据库已启动，请在本地运行前后端。" -ForegroundColor Green
    }

    "up-all" {
        Push-Location $Root
        Write-Host "启动全部服务..." -ForegroundColor Cyan
        & $DockerExe compose up -d --build
        if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
        Pop-Location
        Write-Host "执行: docker compose exec backend python -m app.init_db" -ForegroundColor Yellow
    }

    "status" {
        & $DockerExe ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    }
}
