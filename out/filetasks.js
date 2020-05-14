"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryLockFile = exports.checkSwp = void 0;
const vscode = require("vscode");
const fs = require("fs");
const extension_1 = require("./extension");
const types_1 = require("./types");
const display_1 = require("./display");
let checkSwp = function (dsDoc, hasOthersSwpCallback, noSwpCallback) {
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
                hasOthersSwpCallback(new types_1.swpFile("OTHER"));
            }
            else {
                fs.readFile(dsDoc.swapPath, "utf-8", (err, data) => {
                    let firstPart = data.split(":")[0];
                    if (!err && firstPart === extension_1.swpString) {
                        console.log("Found our .swp at " + dsDoc.swapPath);
                        dsDoc.hasOurSwp = true;
                    }
                    else {
                        var swp = new types_1.swpFile(data);
                        hasOthersSwpCallback(swp);
                    }
                });
            }
        }
    });
};
exports.checkSwp = checkSwp;
let tryLockFile = function (dsDoc) {
    //if the file is locked by us then editing is fine and nothing else needs to be done
    if (dsDoc.hasOurSwp) {
        return;
    }
    checkSwp(dsDoc, (swp) => {
        display_1.warn(dsDoc.basename, true, swp);
    }, () => {
        //if there is no current swp but the file is dirty we should lock it for ourselves
        try {
            fs.writeFileSync(dsDoc.swapPath, extension_1.fullSwpString);
            dsDoc.hasOurSwp = true;
            console.log("Written swp: " + dsDoc.swapPath);
            return true;
        }
        catch (err) {
            dsDoc.hasOurSwp = false;
            console.log("Writing swp failed: " + dsDoc.swapPath);
            return false;
        }
    });
};
exports.tryLockFile = tryLockFile;
//# sourceMappingURL=filetasks.js.map