:: Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
:: For licensing, see LICENSE.md

:: Builds CKEditor release using the source version of CKBuilder (useful for debugging issues in CKBuilder).

echo ""
echo "Starting CKBuilder..."

set SCRIPTDIR=%CD%

cd %SCRIPTDIR%\ckeditor

for /f "delims=" %%a in ('git rev-parse --verify --short HEAD') do @set rev=%%a

:: Move to the CKBuilder root folder.
cd ../../..

node src/ckbuilder.js src/ckbuilder.js ^
--build %SCRIPTDIR%/ckeditor %SCRIPTDIR%/release --build-config %SCRIPTDIR%/ckeditor/dev/builder/build-config.js --overwrite --version=DEV --revision=%rev% %*

cd %SCRIPTDIR%

echo ""
echo "Release created in the \"release\" directory."
