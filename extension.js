// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');

function activate(context) {
    let currentWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern("!", "!")); 
    let channel = vscode.window.createOutputChannel('swap');
    context.subscriptions.push(channel);

    /*vscode.workspace.onDidOpenTextDocument(doc => { 
        console.log('OPENED => ' + doc.uri.toString(true));
    });

    vscode.workspace.onDidCloseTextDocument(doc => { 
        console.log('CLOSED => ' + doc.uri.toString(true));
    }); */

    vscode.window.onDidChangeActiveTextEditor(e => { 
        console.log(e.document.uri);
        var documentPath = e.document.uri.fsPath;

        var lastSlashIndex = documentPath.lastIndexOf('/');
        if (lastSlashIndex === -1) {
            lastSlashIndex = documentPath.lastIndexOf('\\')
        }

        var currentPath = documentPath.substring((0), lastSlashIndex + 1);
        var currentFile = documentPath.substring(lastSlashIndex + 1, documentPath.length);
        var currentFileName = currentFile.substring(0, currentFile.lastIndexOf('.'));

        var targetPath = currentPath + currentFileName + '.swp';
        if (fs.existsSync(targetPath)) {
            vscode.window.showErrorMessage(currentFileName + " is being edited in vim!");
            channel.appendLine(currentFileName + ".swp found");
            channel.show(true);
            return;
        }
        else {
            channel.appendLine("No .swp file for file " + currentFile);
            channel.show(true);
        }

        let pattern = new vscode.RelativePattern(currentPath, (currentFileName + '.swp'));
        console.log(pattern);

        currentWatcher.dispose();

        currentWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        currentWatcher.onDidCreate( () => {
            vscode.window.showWarningMessage('This file is being edited in vim!')
            vscode.window.showSaveDialog({});
        });

        currentWatcher.onDidDelete(() => {
            vscode.window.showInformationMessage('This file is no longer being edited')
        });
    });
    

}

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;