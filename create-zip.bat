@echo off
cd "c:\Users\Mansi Patel\Downloads\TrailPack-dev\backend"
if exist ..\trailpack-v3.zip del ..\trailpack-v3.zip
tar -a -c -f "..\trailpack-v3.zip" .ebextensions middleware models routes services package.json server.js
echo Zip created: trailpack-v3.zip
