"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addOpenDocuments = exports.tryLockFile = exports.checkSwp = exports.emptyDocs = exports.swpString = exports.swpFile = exports.DsDocs = exports.DsDocument = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const ds = require("./display");
const swpString = "VSCODE/" + vscode.env.machineId;
exports.swpString = swpString;
let DsDocs = {};
exports.DsDocs = DsDocs;
class DsDocument {
    constructor(document) {
        let self = this;
        let filePath = document.uri.fsPath;
        let folder = path.dirname(filePath);
        let basename = path.basename(filePath);
        this.textDocument = document;
        this.basename = basename;
        this.swapPath = path.join(folder, "." + basename + ".swp");
        this.hasOurSwp = false;
        this.forceLock = false;
        //If the file has been in use by someone else while dirty,
        //then there may be unimported changes on disk that risk being overwritten
        this.potentialUnsyncedChanges = false;
        this.removeOwnSwp = function () {
            if (self.hasOurSwp) {
                fs.unlink(self.swapPath, (err) => {
                    if (err) {
                        vscode.window.showErrorMessage("Unable to remove own .swp: " + err);
                    }
                });
                self.hasOurSwp = false;
            }
        };
    }
}
exports.DsDocument = DsDocument;
class swpFile {
    constructor(fileData) {
        this.vscodeSwp = false;
        this.swpId = null;
        this.swpUser = null;
        if (fileData.length < 6 || fileData.substring(0, 6) !== "VSCODE") {
            return;
        }
        let temp = fileData.split(":");
        this.vscodeSwp = true;
        this.swpId = temp[0];
        if (temp.length > 1) {
            this.swpUser = temp[1];
        }
    }
}
exports.swpFile = swpFile;
const checkSwp = function (dsDoc, hasOthersSwpCallback, noSwpCallback) {
    fs.stat(dsDoc.swapPath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                noSwpCallback();
            }
            else {
                vscode.window.showErrorMessage("Dirty .swp error: " + err.message);
            }
        }
        else {
            if (stats.size > 5000) {
                //Must be other .swp as we would never create a .swp this big
                hasOthersSwpCallback(new swpFile("OTHER"));
            }
            else {
                //Check if it isn't our swp after all, could be from a lost session
                fs.readFile(dsDoc.swapPath, "utf-8", (err, data) => {
                    let firstPart = data.split(":")[0];
                    if (!err && firstPart === swpString) {
                        console.log("Reclaimed own .swp at " + dsDoc.swapPath);
                        dsDoc.hasOurSwp = true;
                    }
                    else {
                        var swp = new swpFile(data);
                        hasOthersSwpCallback(swp);
                    }
                });
            }
        }
    });
};
exports.checkSwp = checkSwp;
const tryLockFile = function (dsDoc) {
    //If the file is locked by us then editing is fine and nothing else needs to be done
    if (dsDoc.hasOurSwp) {
        return;
    }
    checkSwp(dsDoc, (swp) => {
        ds.warn(dsDoc.basename, true, swp);
    }, () => {
        //If there is no current swp but the file is dirty we should lock it for ourselves
        try {
            fs.writeFileSync(dsDoc.swapPath, getFullSwpString());
            dsDoc.hasOurSwp = true;
            console.log("Written swp: " + dsDoc.swapPath);
            return true;
        }
        catch (err) {
            dsDoc.hasOurSwp = false;
            vscode.window.showErrorMessage("Writing .swp failed: " + err);
            return false;
        }
    });
};
exports.tryLockFile = tryLockFile;
const addOpenDocuments = function (createSwpIfDirty = false) {
    vscode.workspace.textDocuments.forEach((openDocument) => {
        if (openDocument.uri.scheme != "file") {
            return;
        }
        let dsDoc = new DsDocument(openDocument);
        DsDocs[dsDoc.textDocument.uri.toString()] = dsDoc;
        if (createSwpIfDirty && dsDoc.textDocument.isDirty) {
            tryLockFile(dsDoc);
        }
        if (!dsDoc.hasOurSwp) {
            checkSwp(dsDoc, (swp) => {
                ds.warn(dsDoc.basename, false, swp);
            }, () => { });
        }
    });
};
exports.addOpenDocuments = addOpenDocuments;
const emptyDocs = function () {
    exports.DsDocs = DsDocs = {};
};
exports.emptyDocs = emptyDocs;
const getFullSwpString = function () {
    let swpName = vscode.workspace.getConfiguration().get('dirtyswp.writeNameToSwp') || "";
    if (swpName) {
        return swpString + ":" + swpName;
    }
    return swpString;
};
//# sourceMappingURL=core.js.map