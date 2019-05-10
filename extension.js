// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const chokidar = require('chokidar');

let currentWatcher;
let my_swap_path;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    let listener = vscode.window.onDidChangeActiveTextEditor(e => { 
		if (my_swap_path != null) {
			fs.unlinkSync(my_swap_path);
			my_swap_path = null;
		}
        if (e.document && e.document.uri) {
            //console.log(e.document.uri);
            var documentPath = e.document.uri.fsPath;

            var lastSlashIndex = documentPath.lastIndexOf('/');
            if (lastSlashIndex === -1) {
                lastSlashIndex = documentPath.lastIndexOf('\\')
            }

            var currentPath = documentPath.substring((0), lastSlashIndex + 1);
            var currentFile = documentPath.substring(lastSlashIndex + 1, documentPath.length);
            var currentFileName = currentFile.substring(0, currentFile.lastIndexOf('.'));
            var extension = currentFile.substring(currentFile.lastIndexOf('.'), currentFile.length);

            var targetPath = currentPath + '.' + currentFileName + extension + '.swp';
            if (fs.existsSync(targetPath)) {
				vscode.window.showWarningMessage(currentFileName + extension + " is in use somewhere else (.swp file exists)");
                //return;
            } else {
				fs.writeFile(targetPath, "VSCODE", function(err) {
					my_swap_path = targetPath;
					console.log("Created .swp file at " + targetPath);
				});
			}

            let pattern = new vscode.RelativePattern(currentPath, ('.' + currentFileName + '.swp'));
            //console.log(pattern);
			
            if (currentWatcher) { currentWatcher.dispose() }
            currentWatcher = vscode.workspace.createFileSystemWatcher(pattern);
            currentWatcher.onDidCreate( () => {
				console.log("Target path: " + targetPath)
				console.log("my_swap_path" + my_swap_path)
				if (targetPath != my_swap_path) {
					vscode.window.showWarningMessage(currentFileName + extension + " is in use somewhere else (.swp file exists)", 'Open Dialog', 'Save As Dialog')
					.then((choice) => showDialog(choice));
				}
            });

            currentWatcher.onDidDelete(() => {
                vscode.window.showWarningMessage(currentFileName + extension + " is no longer being edited and may have new changes!", 'Open Dialog', 'Save As Dialog')
                .then((choice) => showDialog(choice));
            });
        }
    });
	context.subscriptions.push(listener);

}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
	currentWatcher.dispose();
	if (my_swap_path != null) {
		fs.unlinkSync(my_swap_path);
		my_swap_path = null;
	}
}
exports.deactivate = deactivate;

function showDialog(choice) {
    if (choice == 'Open Dialog') {
        vscode.window.showOpenDialog({});
    }
    else if (choice == 'Save As Dialog') {
        vscode.window.showSaveDialog({});
    }
} 