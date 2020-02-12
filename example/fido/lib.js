const OFTE_AUTHAPI_ENDPOINT = "https://localhost:2357";

function getResponsePromiseOLD(method, url, data, headers = [], contentType = "application/json", timeout = 10000) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url);
        xhr.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                if (xhr.responseText != "") {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    resolve(this);
                }
            } else {
                reject({
                    status: this.status,
                    statusText: this.response
                });
            }
        };
        xhr.onerror = function () {
            reject({
                status: this.status,
                statusText: xhr.statusText
            });
        };
        if (data !== null) {
            xhr.setRequestHeader("Content-Type", contentType);
            switch (contentType) {
                case 'application/json':
                    if (!hasJsonStructure(data)) {
                        data = JSON.stringify(data);
                    }
                    break;
                case 'arraybuffer':
                    xhr.responseType = "arraybuffer"
            }
        }
        xhr.timeout = timeout
        xhr.send(data);
    });
}

function getResponsePromise(method, url, data, headers = [], contentType = "application/json", timeout = 10000) {
    return new Promise(function (resolve, reject) {
        getResponse(resolve, reject, method, url, data, headers, contentType, timeout)
    })
}


async function getResponse(resolve, reject, method, url, data, headers = [], contentType = "application/json", timeout = 10000) {
    var xhr = new XMLHttpRequest()
    try {
        xhr.open(method, url)
    } catch (e) {
        reject({ code: statusNetworkError, detail: e })
        return
    }
    xhr.onload = function () {
        if (this.status >= 200 && this.status < 300) {
            if (xhr.responseText != "") {
                switch (xhr.getResponseHeader("Content-Type")) {
                    case "application/json":
                        resolve(JSON.parse(xhr.responseText))
                    default:
                        resolve(xhr.responseText)
                }
            } else {
                resolve(this);
            }
        } else {
            reject(getError(this))
        }
    }
    xhr.onerror = function (err) {
        console.log("err", err)
        reject({ code: statusNetworkError, detail: 'Network error' })
    }
    xhr.ontimeout = function (err) {
        reject({ code: statusNetworkTimeout, detail: 'Network timeout error' })
    }
    if (data !== null) {
        xhr.setRequestHeader("Content-Type", contentType)
        switch (contentType) {
            case 'application/json':
                if (!hasJsonStructure(data)) {
                    data = JSON.stringify(data);
                }
                break;
            case 'arraybuffer':
                xhr.responseType = "arraybuffer"
        }
    }
    xhr.timeout = timeout
    for (i = 0; i < headers.length; i++) {
        xhr.setRequestHeader(headers[i][0], headers[i][1])
    }
    xhr.send(data)
}

// Base64 to ArrayBuffer
function bufferDecode(value) {
    return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

// ArrayBuffer to URLBase64
function bufferEncode(value) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(value)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");;
}

function hasJsonStructure(str) {
    if (typeof str !== 'string') return false;
    try {
        const result = JSON.parse(str);
        const type = Object.prototype.toString.call(result);
        return type === '[object Object]'
            || type === '[object Array]';
    } catch (err) {
        return false;
    }
}

/*
    {
        "username": "matthew@ofte.io",
        "displayName": "Matthew McNeely",
        "icon": "http://img.com/me.jpg"
    }
*/
function getOrCreatePrincipal(principalData) {

    return new Promise(function (resolve, reject) {
        getResponse(resolve, reject, "POST", OFTE_AUTHAPI_ENDPOINT + '/auth/v1/principals', principalData)
    })
}

async function registerFIDOKey(username) {
    var a11r;
    return new Promise(async (resolve, reject) => {
        await getResponsePromise("GET",
            OFTE_AUTHAPI_ENDPOINT + '/auth/v1/start_fido_registration/' + username)
            .then((credentialCreationOptions) => {
                credentialCreationOptions.publicKey.challenge = bufferDecode(credentialCreationOptions.publicKey.challenge);
                credentialCreationOptions.publicKey.user.id = bufferDecode(credentialCreationOptions.publicKey.user.id);
                if (credentialCreationOptions.publicKey.excludeCredentials) {
                    for (var i = 0; i < credentialCreationOptions.publicKey.excludeCredentials.length; i++) {
                        credentialCreationOptions.publicKey.excludeCredentials[i].id = bufferDecode(credentialCreationOptions.publicKey.excludeCredentials[i].id);
                    }
                }

                console.log("inbound create options: ", credentialCreationOptions.publicKey);
                return navigator.credentials.create({
                    publicKey: credentialCreationOptions.publicKey
                })
            })
            .then(async function (credential) {
                let attestationObject = credential.response.attestationObject;
                let clientDataJSON = credential.response.clientDataJSON;
                let rawId = credential.rawId;

                await getResponsePromise("POST",
                    OFTE_AUTHAPI_ENDPOINT + '/auth/v1/finish_fido_registration/' + username,
                    JSON.stringify({
                        id: credential.id,
                        rawId: bufferEncode(rawId),
                        type: credential.type,
                        response: {
                            attestationObject: bufferEncode(attestationObject),
                            clientDataJSON: bufferEncode(clientDataJSON),
                        },
                    }))
                    .then((autheticator) => {
                        a11r = autheticator
                    })
                    .catch(function (response) {
                        throw new Error(response.responseText);
                    })
            })
            .then((success) => {
                console.log('resolving a11r', a11r)
                resolve(a11r)
            })
            .catch((error) => {
                console.log("failed to register " + username, error)
                reject("failed to reg", username, "error", error)
            })
    })
}

function registerOfteKey(username) {

    callback = function (resp) {
        if (u2fErrorExists(resp)) {
            return
        }
        var request = new XMLHttpRequest();
        request.open('POST', OFTE_AUTHAPI_ENDPOINT + "/auth/v1/finish_ofte_registration/" + username, true);
        request.setRequestHeader('Content-Type', 'application/json;');

        request.onload = function () {
            if (this.status == 200) {
                broadcastEvent('ofte-key-registered', JSON.parse(this.response))
            } else {
                throw new Error(this.response.responseText)
            }
        };
        request.onerror = function () {
            throw new Error('Connection error')
        };

        //console.log('sending this request', JSON.stringify(resp))
        request.send(JSON.stringify(resp))
    }

    var request = new XMLHttpRequest();
    request.open('GET', OFTE_AUTHAPI_ENDPOINT + "/auth/v1/start_ofte_registration/" + username, true);

    request.onload = function () {
        if (this.status >= 200 && this.status < 400) {
            req = JSON.parse(request.responseText)
            //console.log('calling u2f register:', req);
            u2f.register(req.appId, req.registerRequests, req.registeredKeys, callback, 30);
        } else {
            throw new Error(this.response.responseText)
        }
    };
    request.onerror = function () {
        throw new Error('Connection error')
    };
    request.send()
}

// Check for an error in the U2F response object
function u2fErrorExists(resp) {
    if (!('errorCode' in resp)) {
        return false;
    }
    if (resp.errorCode === u2f.ErrorCodes['OK']) {
        return false;
    }
    var msg = 'U2F error code ' + resp.errorCode;
    for (name in u2f.ErrorCodes) {
        if (u2f.ErrorCodes[name] === resp.errorCode) {
            msg += ' (' + name + ')';
        }
    }
    if (resp.errorMessage) {
        msg += ': ' + resp.errorMessage;
    }
    console.log("u2f Error:", msg)
    return true;
}


async function loginFIDOKey(username) {
    return new Promise(async (resolve, reject) => {
        var result
        await getResponsePromise("GET",
            OFTE_AUTHAPI_ENDPOINT + '/auth/v1/start_fido_login/' + username)
            .then((credentialRequestOptions) => {
                credentialRequestOptions.publicKey.userVerification = 'discouraged';
                credentialRequestOptions.publicKey.challenge = bufferDecode(credentialRequestOptions.publicKey.challenge);
                credentialRequestOptions.publicKey.allowCredentials.forEach(function (listItem) {
                    listItem.id = bufferDecode(listItem.id)
                });

                return navigator.credentials.get({
                    publicKey: credentialRequestOptions.publicKey,
                    password: true
                })
            })
            .then(async function (assertion) {
                let authData = assertion.response.authenticatorData;
                let clientDataJSON = assertion.response.clientDataJSON;
                let rawId = assertion.rawId;
                let sig = assertion.response.signature;
                let userHandle = assertion.response.userHandle;

                await getResponsePromise("POST",
                    OFTE_AUTHAPI_ENDPOINT + '/auth/v1/finish_fido_login/' + username,
                    JSON.stringify({
                        id: assertion.id,
                        rawId: bufferEncode(rawId),
                        type: assertion.type,
                        response: {
                            authenticatorData: bufferEncode(authData),
                            clientDataJSON: bufferEncode(clientDataJSON),
                            signature: bufferEncode(sig),
                            userHandle: bufferEncode(userHandle),
                        },
                    })
                )
                    .then(resp => {
                        result = resp
                    })
                    .catch(function (response) {
                        throw new Error(response.responseText)
                    })
            })
            .then(() => {
                resolve(result)
            })
            .catch((error) => {
                console.log("failed to auth", username, "error", error)
                reject("failed to auth", username, "error", error)
            })
    })
}

function ofteAssert(sessionID) {

    callback = function (resp) {
        if (u2fErrorExists(resp)) {
            return
        }
        var request = new XMLHttpRequest();
        request.open('POST', OFTE_AUTHAPI_ENDPOINT + "/auth/v1/finish_ofte_assert/" + sessionID, true);
        request.setRequestHeader('Content-Type', 'application/json;');

        request.onload = function () {
            if (this.status == 200) {
                console.log('ofte-assert successful')
                broadcastEvent('ofte-key-assert', sessionID)
            } else {
                throw new Error(this.response.responseText)
            }
        };
        request.onerror = function () {
            throw new Error('Connection error')
        };

        //console.log('sending this request', JSON.stringify(resp))
        request.send(JSON.stringify(resp))
    }

    var request = new XMLHttpRequest();
    request.open('GET', OFTE_AUTHAPI_ENDPOINT + "/auth/v1/start_ofte_assert/" + sessionID, true);

    request.onload = function () {
        if (this.status == 200) {
            req = JSON.parse(request.responseText)
            console.log('calling u2fsign:', req);
            u2f.sign(req.appId, req.challenge, req.registeredKeys, callback, 30);
        } else {
            throw new Error(this.response.responseText)
        }
    };
    request.onerror = function () {
        throw new Error('Connection error')
    };
    request.send()
}

function ofteAccess(sessionID, method, url, data, contentType = "application/json", timeout = 10000) {
    var accessRequestID

    return new Promise(function (resolve, reject) {

        callback = function (resp) {
            if (u2fErrorExists(resp)) {
                return
            }
            var request = new XMLHttpRequest();
            request.open('POST', OFTE_AUTHAPI_ENDPOINT + "/auth/v1/finish_ofte_access/" + sessionID, true);
            request.setRequestHeader('Content-Type', 'application/json;');

            request.onload = async function () {
                if (this.status == 200) {
                    resetTimer(sessionID)
                    let token = this.getResponseHeader("Ofte-AccessToken")
                    await getResponse(resolve, reject, method, url, data, [["Ofte-SessionID", sessionID], ["Ofte-AccessToken", token]], contentType, timeout)
                    .then(() => {
                        broadcastEvent('ofte-access', url)
                    })
                    .catch((err) => {
                        broadcastEvent('ofte-error', err)
                    })
                } else {
                    throw new Error(this.response.responseText)
                }
            };
            request.onerror = function () {
                throw new Error('Connection error')
            };

            request.send(JSON.stringify(resp))
        }

        var request = new XMLHttpRequest();
        request.open('GET', OFTE_AUTHAPI_ENDPOINT + "/auth/v1/start_ofte_access/" + sessionID, true);

        request.onload = function () {
            if (this.status == 200) {
                req = JSON.parse(request.responseText)
                u2f.sign(req.appId, req.challenge, req.registeredKeys, callback, 30);
            } else {
                throw new Error(this.response.responseText)
            }
        };
        request.onerror = function () {
            throw new Error('Connection error')
        };
        request.send()
    })
}

var caTimer
function startOfteCA(sessionID) {
    ofteAssert(sessionID)
    caTimer = window.setTimeout(startOfteCA, 20 * 1000, sessionID)
}

function stopOfteCA() {
    window.clearTimeout(caTimer)
}

function resetTimer(sessionID) {
    window.clearTimeout(caTimer)
    caTimer = window.setTimeout(startOfteCA, 20 * 1000, sessionID)
}

function broadcastEvent(eventName, detail = null) {
    let event = new CustomEvent(eventName, { detail: detail })
    document.dispatchEvent(event)
}

// Use a worker-based timer to get more consistent scheduling for setTimeout
// --------- • ---------

function workerBlob() {
    var timers = {}

    function fireTimeout(id) {
        this.postMessage({ id: id })
        delete timers[id]
    }

    this.addEventListener("message", function (evt) {
        var data = evt.data

        switch (data.command) {
            case "setTimeout":
                var time = parseInt(data.timeout || 0, 10),
                    timer = setTimeout(fireTimeout.bind(null, data.id), time)
                timers[data.id] = timer
                break
            case "clearTimeout":
                var timer = timers[data.id]
                if (timer) clearTimeout(timer)
                delete timers[data.id]
        }
    })
}

var timeoutId = 0
var timeouts = {}
let worker = new Worker(URL.createObjectURL(new Blob(["(" + workerBlob.toString() + ")()"], { type: 'text/javascript' })))

worker.addEventListener("message", function (evt) {
    var data = evt.data,
        id = data.id,
        fn = timeouts[id].fn,
        args = timeouts[id].args

    fn.apply(null, args)
    delete timeouts[id]
});

// override the native setTimeout function
window.setTimeout = function (fn, delay) {
    var args = Array.prototype.slice.call(arguments, 2)
    timeoutId += 1
    delay = delay || 0
    var id = timeoutId
    timeouts[id] = { fn: fn, args: args }
    worker.postMessage({ command: "setTimeout", id: id, timeout: delay })
    return id
};

// override the native clearTimeout function
window.clearTimeout = function (id) {
    worker.postMessage({ command: "clearTimeout", id: id })
    delete timeouts[id]
};