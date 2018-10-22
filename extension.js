// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');

let currentWatcher;

function activate(context) {

    let listener = vscode.window.onDidChangeActiveTextEditor(e => { 
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

            var targetPath = currentPath + '.' + currentFileName + '.swp';
            if (fs.existsSync(targetPath)) {
                vscode.window.showErrorMessage(currentFileName + " is being edited in vim!");
                //return;
            }

            let pattern = new vscode.RelativePattern(currentPath, ('.' + currentFileName + '.swp'));
            //console.log(pattern);

            if (currentWatcher) { currentWatcher.dispose() }
            currentWatcher = vscode.workspace.createFileSystemWatcher(pattern);
            currentWatcher.onDidCreate( () => {
                vscode.window.showErrorMessage(currentFileName + " is being edited in vim!", 'Open Dialog', 'Save As Dialog')
                .then((choice) => showDialog(choice));
            });

            currentWatcher.onDidDelete(() => {
                vscode.window.showWarningMessage('This file is no longer being edited, but may have unimported changes', 'Open Dialog', 'Save As Dialog')
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