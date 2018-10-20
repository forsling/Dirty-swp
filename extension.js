// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
//const fs = require('fs');

function activate(context) {
    let currentWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern("!", "!")); 
    let channel = vscode.window.createOutputChannel('relative');
    context.subscriptions.push(channel);

    channel.appendLine(`New output channel`);

    vscode.workspace.onDidOpenTextDocument(doc => { 
        console.log('OPENED => ' + doc.uri.toString(true));
    });

    vscode.workspace.onDidCloseTextDocument(doc => { 
        console.log('CLOSED => ' + doc.uri.toString(true));
    });

    vscode.window.onDidChangeActiveTextEditor(e => { 
        var documentPath = e.document.uri.fsPath;
        var currentPath = documentPath.substring((0), documentPath.lastIndexOf('\\') + 1);
        var currentFile = documentPath.substring(documentPath.lastIndexOf('\\') + 1, documentPath.length - 1);
        var currentFileName = currentFile.substring(0, currentFile.lastIndexOf('.'));

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