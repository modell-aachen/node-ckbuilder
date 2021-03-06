/*
 Copyright (c) 2012-2014, CKSource - Frederico Knabben. All rights reserved.
 For licensing, see LICENSE.md
 */

"use strict";

var fs = require( "fs-extra" );
var path = require( "path" );
var linter = require( "eslint" ).linter;
var ckbuilder = {
	io: require( "./io" ),
	options: require( "./options" ),
	error: require( "./error" )
};

var regexLib = {
	eol: new RegExp( '(?:\\x09|\\x20)+$', 'gm' ),
	eof: new RegExp( '(?:\\x09|\\x20|\\r|\\n)+$' ),
	remove: new RegExp( '^.*?%REMOVE_START%[\\s\\S]*?%REMOVE_END%.*?$', 'gm' ),
	removeCore: new RegExp( '^.*?%REMOVE_START_CORE%[\\s\\S]*?%REMOVE_END_CORE%.*?$', 'gm' ),
	removeLine: new RegExp( '.*%REMOVE_LINE%.*(?:\\r\\n|\\r|\\n)?', 'g' ),
	removeLineCore: new RegExp( '.*%REMOVE_LINE_CORE%.*(?:\\r\\n|\\r|\\n)?', 'g' ),
	timestamp: new RegExp( '%TIMESTAMP%', 'g' ),
	copyrightComment: new RegExp( '/\\*[\\s\\*]*Copyright[\\s\\S]+?\\*/(?:\\r\\n|\\r|\\n)', 'i' ),
	licenseComment: new RegExp( '/\\*[\\s\\*]*\\@license[\\s\\S]+?\\*/(?:\\r\\n|\\r|\\n)' ),
	rev: new RegExp( '%REV%', 'g' ),
	version: new RegExp( '%VERSION%', 'g' ),
	license: new RegExp( '\\@license( )?', 'g' )
};


var lineEndings = {
	"cgi": "\n",
	"pl": "\n",
	"sh": "\n",
	"readme": "\r\n",
	"afp": "\r\n",
	"afpa": "\r\n",
	"ascx": "\r\n",
	"asp": "\r\n",
	"aspx": "\r\n",
	"bat": "\r\n",
	"cfc": "\r\n",
	"cfm": "\r\n",
	"code": "\r\n",
	"command": "\r\n",
	"conf": "\r\n",
	"css": "\r\n",
	"dtd": "\r\n",
	"htaccess": "\r\n",
	"htc": "\r\n",
	"htm": "\r\n",
	"html": "\r\n",
	"js": "\r\n",
	"jsp": "\r\n",
	"lasso": "\r\n",
	"md": "\r\n",
	"php": "\r\n",
	"py": "\r\n",
	"sample": "\r\n",
	"txt": "\r\n",
	"xml": "\r\n"
};

ckbuilder.tools = {
	/**
	 * Fix line endings in given file. Only selected text files are processed.
	 *
	 * @param {java.io.File} sourceFile
	 * @param {java.io.File} targetFile
	 * @static
	 */
	fixLineEndings: function( sourceFile, targetFile ) {
		var extension = ckbuilder.io.getExtension( sourceFile );
		var bomExtensions = { asp: 1, js: 1 };

		if ( !lineEndings[ extension ] ) {
			return false;
		}

		if ( ckbuilder.options.debug > 1 ) {
			console.log( "Fixing line endings in: " + path.resolve( targetFile ) );
		}

		var buffer = [];
		var firstLine = true;
		fs.readFileSync( sourceFile ).toString().split( /\r\n|\r|\n/ ).forEach( ( line ) => {
			if ( firstLine ) {
				var hasBom = line.length && line.charCodeAt( 0 ) === 65279;
				if ( !hasBom && extension in bomExtensions ) {
					buffer.push( String.fromCharCode( 65279 ) );
				} else if ( hasBom && !( extension in bomExtensions ) ) {
					line = line.substring( 1 );
				}

				firstLine = false;
			}

			// Strip whitespace characters
			line = line.replace( regexLib.eol, "" );
			buffer.push( line );
			buffer.push( lineEndings[ extension ] );
		} );

		ckbuilder.io.saveFile( targetFile, buffer.join( "" ).replace( regexLib.eof, lineEndings[ extension ] ) );

		return true;
	},

	/**
	 * Updates copyright headers in text files.
	 *
	 * @param {java.io.File} targetFile
	 */
	updateCopyrights: function( targetFile ) {
		var extension = ckbuilder.io.getExtension( targetFile );
		var bomExtensions = { asp: 1, js: 1 };

		if ( !lineEndings[ extension ] ) {
			return false;
		}

		var text = ckbuilder.io.readFile( targetFile );
		if ( text.indexOf( "Copyright" ) === -1 || text.indexOf( "CKSource" ) === -1 ) {
			return;
		}

		if ( text.indexOf( 'For licensing, see LICENSE.md or http://ckeditor.com/license' ) !== -1 ) {
			text = text.replace( 'For licensing, see LICENSE.md or http://ckeditor.com/license', 'This software is covered by CKEditor Commercial License. Usage without proper license is prohibited.' );
			ckbuilder.io.saveFile( targetFile, text, bomExtensions[ extension ] );
			return;
		}

		if ( text.indexOf( 'For licensing, see LICENSE.md or [http://ckeditor.com/license](http://ckeditor.com/license)' ) !== -1 ) {
			text = text.replace( 'For licensing, see LICENSE.md or [http://ckeditor.com/license](http://ckeditor.com/license)', 'This software is covered by CKEditor Commercial License. Usage without proper license is prohibited.' );
			ckbuilder.io.saveFile( targetFile, text, bomExtensions[ extension ] );
			return;
		}
	},

	/**
	 * Returns the copyright statement found in the text
	 * The Copyright statement starts either with "@license" or with "Copyright".
	 *
	 * @param {String} text
	 * @returns {String}
	 * @static
	 */
	getCopyrightFromText: function( text ) {
		var result = regexLib.copyrightComment.exec( text );
		if ( result !== null ) {
			return result[ 0 ];
		}

		result = regexLib.licenseComment.exec( text );
		if ( result !== null ) {
			return result[ 0 ];
		}

		return "";
	},

	/**
	 * Remove all copyright statements in given string.
	 *
	 * @param {String} text
	 * @returns {String}
	 * @static
	 */
	removeLicenseInstruction: function( text ) {
		return text.replace( regexLib.license, "" );
	},

	/**
	 * Cleans up the target folder.
	 *
	 * @param {java.io.File} targetLocation
	 * @static
	 */
	prepareTargetFolder: function( targetLocation ) {
		if ( ckbuilder.io.exists( targetLocation ) ) {
			if ( !ckbuilder.options.overwrite ) {
				ckbuilder.error( "Target folder already exists: " + path.resolve( targetLocation ) );
			}

			console.log( "Cleaning up target folder" );
			try {
				ckbuilder.io.deleteDirectory( targetLocation );
			} catch ( e ) {
				throw( "Unable to delete target directory: " + path.resolve( targetLocation ) );
			}
		}
		try {
			fs.mkdirSync( targetLocation );
		} catch ( e ) {
			throw( "Unable to create target directory: " + path.resolve( targetLocation ) + "\n" );
		}
	},

	/**
	 * Validate all JS files included in given location using Rhino parser.
	 *
	 * @param {java.io.File} sourceLocation Folder to validate.
	 * @returns {String} An error message with errors, if found any. Empty string if no errors are found.
	 * @static
	 */
	validateJavaScriptFiles: function( sourceLocation ) {
		var result = "";
		var files = fs.readdirSync( sourceLocation );
		files.forEach( ( file ) => {
			var error;
			var f = path.resolve( sourceLocation, file );
			if ( fs.statSync( f ).isDirectory() ) {
				error = this.validateJavaScriptFiles( f );
				if ( error ) {
					result += error;
				}
			} else if ( ckbuilder.io.getExtension( file ) === "js" ) {
				error = this.validateJavaScriptFile( f );
				if ( error ) {
					result += error + "\n";
				}
			}
		});
		return result;
	},

	/**
	 * Validate JS file included in given location using eslint.
	 *
	 * @param {java.io.File} sourceLocation Folder to validate.
	 * @returns {String} An error message with errors, if found any. Empty string if no errors are found.
	 * @static
	 */
	validateJavaScriptFile: function( sourceLocation ) {
		var messages = linter.verify( ckbuilder.io.readFile( sourceLocation ), {}, { filename: sourceLocation } );
		var result = [];
		if ( messages.length ) {
			for ( var i = 0; i < messages.length; i++ ) {
				result.push( sourceLocation + " (line " + messages[ 0 ].line + "):\n    " + messages[ 0 ].message );
			}
		}
		return result.join( "\n" );
	},

	/**
	 * Replace CKBuilder directives in given file.
	 * %VERSION%:
	 *     the "version" string passed to the CKReleaser execution command.
	 * %REV%:
	 *     the revision number of the source directory (returned by version control system).
	 * %TIMESTAMP%:
	 *     a four characters string containing the
	 *     concatenation of the "Base 36" value of each of the following components
	 *     of the program execution date and time: year + month + day + hour.
	 * %REMOVE_LINE%:
	 *     removes the line.
	 * %REMOVE_START% and %REMOVE_END%:
	 *     removes all lines starting from %REMOVE_START% to %REMOVE_END%,
	 *     declaration line inclusive.
	 * %LEAVE_UNMINIFIED%
	 *     if set, the resulting object contains LEAVE_UNMINIFIED property set to true.
	 *
	 * @param {java.io.File} file File in which replace the directives
	 * @param {Object} directives (optional) An object with values for placeholders.
	 * @param {Boolean} core Whether to process core directives
	 * @returns {Object} an object with optional set of flags.
	 * @static
	 * Available flags:
	 * LEAVE_UNMINIFIED (Boolean) Indicates whether the file should be minified.
	 */
	processDirectives: function( location, directives, core ) {
		var flags = {};
		var text = ckbuilder.io.readFile( location );

		if ( text.indexOf( "%LEAVE_UNMINIFIED%" ) !== -1 ) {
			flags.LEAVE_UNMINIFIED = true;
		}

		if ( text.indexOf( "%VERSION%" ) !== -1 || text.indexOf( "%REV%" ) !== -1 || text.indexOf( "%TIMESTAMP%" ) !== -1 || text.indexOf( "%REMOVE_START" ) !== -1 || text.indexOf( "%REMOVE_END" ) !== -1 || text.indexOf( "%REMOVE_LINE" ) !== -1 ) {
			var processedText = this.processDirectivesInString( text, directives );
			if ( core ) {
				processedText = this.processCoreDirectivesInString( processedText );
			}

			if ( text !== processedText ) {
				if ( ckbuilder.options.debug ) {
					console.log( "Replaced directives in " + path.resolve( location ) );
				}

				ckbuilder.io.saveFile( location, processedText );
			}
		}

		return flags;
	},

	/**
	 * Replace CKBuilder directives in given string.
	 * %VERSION%:
	 *     the "version" string passed to the CKBuilder execution command.
	 * %REV%:
	 *     the revision number of the source directory (returned by version control system).
	 * %TIMESTAMP%:
	 *     a four characters string containing the
	 *     concatenation of the "Base 36" value of each of the following components
	 *     of the program execution date and time: year + month + day + hour.
	 * %REMOVE_LINE%:
	 *     removes the line.
	 * %REMOVE_LINE_CORE%:
	 *     removes the line, but only if file is included in core (merged into ckeditor.js).
	 * %REMOVE_START% and %REMOVE_END%:
	 *     removes all lines starting from %REMOVE_START% to %REMOVE_END%,
	 *     declaration line inclusive.
	 * %REMOVE_START_CORE% and %REMOVE_END_CORE%:
	 *     same as %REMOVE_START% and %REMOVE_END%, but works
	 *     only if file is included in core (merged into ckeditor.js).
	 * @param text {String} Text in which replace the directives
	 * @param directives {Object} (Optional) An object with values for placeholders.
	 * @returns {String} Text
	 * @static
	 */
	processDirectivesInString: function( text, directives ) {
		directives = directives || {};
		directives.version = directives.version || ckbuilder.options.version;
		directives.revision = directives.revision || ckbuilder.options.revision;
		directives.timestamp = directives.timestamp || ckbuilder.options.timestamp;

		if ( text.indexOf( "%VERSION%" ) !== -1 ) {
			text = text.replace( regexLib.version, directives.version );
		}

		if ( text.indexOf( "%REV%" ) !== -1 ) {
			text = text.replace( regexLib.rev, directives.revision );
		}

		if ( text.indexOf( "%TIMESTAMP%" ) !== -1 ) {
			text = text.replace( regexLib.timestamp, directives.timestamp );
		}

		if ( text.indexOf( "%REMOVE_START%" ) !== -1 && text.indexOf( "%REMOVE_END%" ) !== -1 ) {
			text = text.replace( regexLib.remove, "%REMOVE_LINE%" );
			text = text.replace( regexLib.removeLine, "" );
		} else if ( text.indexOf( "%REMOVE_LINE%" ) !== -1 ) {
			text = text.replace( regexLib.removeLine, "" );
		}

		return text;
	},

	/**
	 * Replace CKBuilder "core" directives in given string.
	 * %REMOVE_LINE_CORE%:
	 *     removes the line, but only if file is included in core (merged into ckeditor.js).
	 * %REMOVE_START_CORE% and %REMOVE_END_CORE%:
	 *     same as %REMOVE_START% and %REMOVE_END%, but works
	 *     only if file is included in core (merged into ckeditor.js).
	 * @param {String} text Text in which replace the directives
	 * @returns {String}
	 * @static
	 */
	processCoreDirectivesInString: function( text ) {
		if ( text.indexOf( "%REMOVE_START_CORE%" ) !== -1 && text.indexOf( "%REMOVE_END_CORE%" ) !== -1 ) {
			text = text.replace( regexLib.removeCore, "%REMOVE_LINE_CORE%" );
			text = text.replace( regexLib.removeLineCore, "" );
		} else if ( text.indexOf( "%REMOVE_LINE_CORE%" ) !== -1 ) {
			text = text.replace( regexLib.removeLineCore, "" );
		}

		return text;
	}
};

module.exports = ckbuilder.tools;
