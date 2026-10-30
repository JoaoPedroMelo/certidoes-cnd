@echo off
chcp 65001 >nul
title Robo de Certidoes CND
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao esta instalado. Baixe em https://nodejs.org e instale a versao LTS.
  pause
  exit /b 1
)

if not exist ".env" (
  echo Arquivo .env nao encontrado. Copie .env.example para .env e preencha PAINEL_URL e ROBO_TOKEN.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias pela primeira vez...
  call npm install --omit=dev
)

:loop
node robo.js
echo.
echo O robo parou. Reiniciando em 10 segundos (feche esta janela para encerrar)...
timeout /t 10 >nul
goto loop
