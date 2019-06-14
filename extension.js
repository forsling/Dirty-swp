// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let documents = {}
let swpStatusBar;
let active = true;

function DocumentInfo(document) {
    let filePath = document.uri.fsPath
    let folder = path.dirname(filePath)
    let basename = path.basename(filePath)

    this.basename = basename
    this.document = document
    this.swapPath = path.join(folder, "." + basename + ".swp")    
    this.hasOurSwp = false;
    this.forceLock = false;
    this.wasInUse = null;
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    let openDocumentListener = vscode.workspace.onDidOpenTextDocument(e => {
        if (!active || e.uri.scheme != "file") {
            return;
        }
        
        //create opendocument object and add it to documents
        getDocInfoAsync(e, (docinfo) => {
            //add docinfo object to documents
            documents[docinfo.document.uri] = docinfo;

            //warn user if file was already in use by someone else
            if (docinfo.wasInUse) {
                vscode.window.showWarningMessage(docinfo.basename + " is in use somewhere else (.swp file exists)")
            }
            console.log(documents);
        })
    })

    let closeDocumentListener = vscode.workspace.onDidCloseTextDocument(e => {
        if (!active || e.uri.scheme != "file") {
            return;
        }

        let doc = documents[e.uri];
        //If there is a swap file that we created, remove it on document close
        if (doc.hasOurSwp) {
            fs.exists(doc.swapPath, (exists) => {
                if (exists) {
                    fs.unlinkSync(doc.swapPath)
                }
            })
        }
        delete documents[e.uri];
        console.log(documents);
    })

    let documentChangedListener = vscode.workspace.onDidChangeTextDocument(e => {
        if (!active || e.document.uri.scheme != "file") {
            return;
        }

        let doc = documents[e.document.uri];
        if (doc.document.isDirty) {
            writeOwnSwp(doc)
        } 
        //if file is no longer dirty but still has our swp, then we can remove the .swp file unless forcelock is set
        else if (doc.hasOurSwp && !doc.forceLock) {
            fs.exists(doc.swapPath, (ourSwpExists) => {
                if (ourSwpExists) {
                    fs.unlinkSync(doc.swapPath);
                }
                doc.hasOurSwp = false;
            })
        }
    })

    //on startup, add any already opened documents
    addOpenDocuments();

    context.subscriptions.push(openDocumentListener);
    context.subscriptions.push(closeDocumentListener);
    context.subscriptions.push(documentChangedListener);

    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.start', () => {
        vscode.window.showInformationMessage("Turning on .swp support");
        active = true;
        addOpenDocuments(true);
        swpStatusBar.show();
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.stop', () => {
        vscode.window.showInformationMessage("Turning off .swp support");
        swpStatusBar.hide();
        deactivate();
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.forcelock', () => {
        let name = vscode.window.activeTextEditor.document.uri;
        let docinfo = documents[name];
        docinfo.forceLock = true;
        writeOwnSwp(docinfo)
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dirtyswp.listswp', () => {
        let files = [];
        Object.entries(documents).forEach(entry => {
            let doc = entry[1];
            console.log(doc);
            if (doc.hasOurSwp) {
                let description = doc.forceLock ? "Locked by us (until close)" : "Locked by us (dirty)";
                files.push({"label": doc.document.fileName, "description": description, docinfo: doc});
            } else {
                let inUse = fs.existsSync(doc.swapPath)
                if (inUse) {
                    files.push({"label": doc.document.fileName, "description": "Locked by other party (WARNING)", docinfo: doc});
                }
            }
        })
        vscode.window.showQuickPick(files)
        .then((val) => {
            console.log(val);
            if (val) {
                vscode.window.showTextDocument(val.docinfo.document);
            }
        })
    }));

    swpStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    context.subscriptions.push(swpStatusBar);
    swpStatusBar.text = ".swp"
    swpStatusBar.command = "dirtyswp.listswp"
    swpStatusBar.show();
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
    for (let doc of Object.keys(documents)) {
        if (documents[doc].hasOurSwp) {
            fs.unlinkSync(documents[doc].swapPath);
        }
    }
    documents = {};
}
exports.deactivate = deactivate;

function writeOwnSwp(docinfo, resultCallback) {
    //if the file is locked by us then editing is fine and nothing else needs to be done
    if (docinfo.hasOurSwp) {
        if (resultCallback) { resultCallback("OUR_SWP_ALREADY_PRESENT") }
        return
    }
    
    //if the file has a swp here then somebody else is editing it
    fs.exists(docinfo.swapPath, (hasSwp) => {
        if (hasSwp) {
            vscode.window.showWarningMessage(docinfo.basename + " is in use someplace else: If you save your changes you may overwrite somebody elses!", 'Open Dialog', 'Save As Dialog')
            .then((choice) => showDialog(choice));
            if (resultCallback) { resultCallback("FILE_LOCKED_BY_OTHER") }
        } else {
            //if there is no current swp but the file is dirty we should lock it for ourselves
            docinfo.hasOurSwp = true; //need to set this now to prevent async issues
            fs.writeFile(docinfo.swapPath, "VSCODE/" + vscode.env.machineId, (err) => {
                if (!err) {
                    console.log("Written swp: " + docinfo.swapPath)
                    if (resultCallback) { resultCallback("SWP_WRITE_SUCCESS") }
                } else {
                    docinfo.hasOurSwp = false;
                    vscode.window.showErrorMessage("Unable to create .swp file. Somebody else may start editing the file")
                    if (resultCallback) { resultCallback("SWP_WRITE_FAILED") }
                }
            })
        }
    })
}

function getDocInfoSync(document) {
    let DocInfo = new DocumentInfo(document)
    DocInfo.wasInUse = fs.existsSync(document.swapPath)
    return DocInfo
}

function getDocInfoAsync(document, callback) {
    let DocInfo = new DocumentInfo(document)
    fs.exists(DocInfo.swapPath, (swpExists) => {
        DocInfo.wasInUse = swpExists
        callback(DocInfo)
    })
}

function addOpenDocuments(createSwpIfDirty = false) {
    console.log(vscode.workspace.textDocuments);
    console.log(vscode.window.visibleTextEditors);
    vscode.workspace.textDocuments.forEach((openDocument) => {
        if (openDocument.uri.scheme != "file") {
            return
        }
        getDocInfoAsync(openDocument, (docinfo) => {
            documents[docinfo.document.uri] = docinfo;
            if (createSwpIfDirty && docinfo.document.isDirty) {
                writeOwnSwp(docinfo)
            }
            
            fs.exists(docinfo.swapPath, (exists) => {
                if (exists && !docinfo.hasOurSwp) {
                    vscode.window.showWarningMessage(docinfo.basename + " is in use somewhere else (.swp file exists)")
                }
            })
        })
    })
}

function showDialog(choice) {
    if (choice == 'Open Dialog') {
        vscode.window.showOpenDialog({});
    }
    else if (choice == 'Save As Dialog') {
        vscode.window.showSaveDialog({});
    }
} 
