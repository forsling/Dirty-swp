// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let documents = {}

function openfile(document, wasInuse, swapPath) {
    this.document = document;
    this.swapPath = swapPath;
    this.wasInUse = wasInuse;
    this.hasOurSwp = false;
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    let listener1 = vscode.workspace.onDidOpenTextDocument(e => {
        console.log("Document open: " + e.fileName)
        let filePath = e.uri.fsPath;

        if (path.extname(filePath) === ".swp") {
            return
        }

        let folder = path.dirname(filePath)
        let file = path.basename(filePath)
        let swapPath = path.join(folder, "." + file + ".swp")

        fs.exists(swapPath, (exists) => {
            let doc = new openfile(e, exists, swapPath);
            documents[doc.document.uri] = doc;

            //file was already in use by someone else
            if (exists) {
                vscode.window.showWarningMessage(file + " is in use somewhere else (.swp file exists)", 'Open Dialog', 'Save As Dialog')
				.then((choice) => showDialog(choice));
            }

            console.log(documents);
        })
    })

    let listener2 = vscode.workspace.onDidCloseTextDocument(e => {
        console.log("Document close: " + e.fileName)
        let doc = documents[e.uri];
        //If there is a swap file that we created, remove it on document close
        if (!doc.wasInUse) {
            fs.exists(doc.swapPath, (exists) => {
                if (exists) {
                    fs.unlinkSync(doc.swapPath)
                }
            })
        }
        delete documents[e.uri];
        console.log(documents);
    })

    let listener3 = vscode.workspace.onDidChangeTextDocument(e => {
        //console.log("isDirty: " + e.document.isDirty);
        let doc = documents[e.document.uri];
        if (doc.document.isDirty) {
            if (doc.wasInUse) {

            } else if (!doc.hasOurSwp) {
                fs.writeFile(doc.swapPath, "VSCODE/" + vscode.env.machineId, (err) => {
                    if (!err) {
                        console.log("Written swp: " + doc.swapPath)
                        doc.hasOurSwp = true;
                    }
                })
            }
        } else if (doc.hasOurSwp) {
            fs.unlink(doc.swapPath, (err) => {
                if (!err) {
                    doc.hasOurSwp = false;
                }
            })
        }
    })

    context.subscriptions.push(listener1);
    context.subscriptions.push(listener2);
    context.subscriptions.push(listener3);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
    for (let doc of Object.keys(documents)) {
        if (documents[doc].hasOurSwp) {
            fs.unlinkSync(documents[doc].swapPath);
        }
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
