@echo off
rem Cria um atalho do robo na pasta Inicializar do Windows (abre sozinho ao ligar o PC).
set "ALVO=%~dp0INICIAR-ROBO.bat"
set "ATALHO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Robo de Certidoes CND.lnk"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:ATALHO); $s.TargetPath=$env:ALVO; $s.WorkingDirectory=(Split-Path $env:ALVO); $s.WindowStyle=7; $s.Save()"
echo Pronto! O robo vai abrir sozinho sempre que o Windows iniciar.
pause
