@echo off
title PageForge
cd /d "C:\Users\simple_pear\Desktop\Hermesthings\pageforge"
start "" /min cmd /c "npx vite --port 5173 --strictPort"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"
