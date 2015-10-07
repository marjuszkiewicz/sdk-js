/*global require:false, module:false*/
var
    _version = '<%= pkg.version %>',
    config = require('./spid-config'),
    _initiated = false,
    _session = {},
    util = require('./spid-util.js'),
    spidEvent = require('./spid-event'),
    eventTrigger = require('./spid-event-trigger'),
    persist = require('./spid-persist'),
    talk = require('./spid-talk');


function globalExport(global) {
    global.SPiD = global.SPiD || this;
    global.SPiD.Talk = require('./spid-talk');
}

function init(opts, callback) {
    config.init(opts);
    if(!config.options().noGlobalExport) {
        globalExport(window);
    }
    _initiated = true;
    if(callback) {
        callback();
    }
}

function hasSession(callback) {
    callback = callback || function() {
        };
    var that = this,
        respond = function(err, data) {
            eventTrigger.session(_session, data);
            _session = data;
            callback(err, data);
        },
        handleResponse = function(err, data) {
            if(persist && !err && !!data.result) {
                persist.set("Session", data, data.expiresIn);
            }
            respond(err, data);
        },
        handleException = function(err, data) {
            if(err && err.type === "LoginException") {
                //if(spidEvent) {
                spidEvent.fire('SPiD.loginException');
                //}
                //Fallback to core
                return talk.request(that.coreEndpoint(), null, {autologin: 1}, handleResponse);
            } else if(err && eventTrigger) {
                eventTrigger.sessionError(err);
            }
            handleResponse(err, data);
        };

    if(persist) {
        var data = persist.get("Session");
        if(data) {
            _session = data;
            return respond(null, data);
        }
    }
    talk.request(this.sessionEndpoint(), null, {autologin: 1}, handleException);
}

function hasProduct(productId, callback) {
    callback = callback || function() {
        };
    if(persist) {
        var cacheVal = persist.get('prd_{id}'.replace('{id}', productId));
        if(cacheVal && (cacheVal.refreshed + config.options().refresh_timeout) > util.now()) {
            return callback(null, cacheVal);
        }
    }
    var cb = function(err, data) {
        if(persist && !err && !!data.result) {
            data.refreshed = util.now();
            persist.set('prd_{id}'.replace('{id}', productId), data);
        }
        if(spidEvent && !err && !!data.result) {
            spidEvent.fire('SPiD.hasProduct', {
                productId: productId,
                result: data.result
            });
        }
        callback(err, data);
    };
    talk.request(this.server(), 'ajax/hasproduct.js', {product_id: productId}, cb);
}

function hasSubscription(productId, callback) {
    var cache = persist;
    callback = callback || function() {
        };
    if(cache) {
        var cacheVal = cache.get('sub_{id}'.replace('{id}', productId));
        if(cacheVal && (cacheVal.refreshed + config.options().refresh_timeout) > util.now()) {
            return callback(null, cacheVal);
        }
    }
    var cb = function(err, data) {
        if(cache && !err && !!data.result) {
            data.refreshed = util.now();
            cache.set('sub_{id}'.replace('{id}', productId), data);
        }
        if(spidEvent && !err && !!data.result) {
            spidEvent.fire('SPiD.hasSubscription', {
                subscriptionId: productId,
                result: data.result
            });
        }
        callback(err, data);
    };
    talk.request(this.server(), 'ajax/hassubscription.js', {product_id: productId}, cb);
}

function setTraits(traits, callback) {
    callback = callback || function() {
        };
    talk.request(this.server(), 'ajax/traits.js', {t: traits}, callback);
}

function logout(callback) {
    var cb = function(err, data) {
        if(data.result) {
            persist.clear("Session");
        }

        if(spidEvent && !err && !!data.result) {
            spidEvent.fire('SPiD.logout', data);
        }

        if(callback) {
            callback(err, data);
        }
    };
    talk.request(this.server(), 'ajax/logout.js', {}, cb);
}

//Async loader
window.setTimeout(function() {
    if(typeof (window.asyncSPiD) === 'function' && !window.asyncSPiD.hasRun) {
        window.asyncSPiD();
        window.asyncSPiD.hasRun = true;
    }
}, 0);

module.exports = {
    version: function() {
        return _version;
    },
    initiated: function() {
        return _initiated;
    },
    server: function() {
        return (config.options().https ? 'https' : 'http') + '://' + config.options().server + '/';
    },
    sessionEndpoint: function() {
        return (config.options().https ? 'https' : 'http') + '://' + (config.options().useSessionCluster ? 'session.' + config.options().server + '/rpc/hasSession.js' : config.options().server + '/ajax/hasSession.js');
    },
    coreEndpoint: function() {
        return (config.options().https ? 'https' : 'http') + '://' + config.options().server + '/ajax/hasSession.js';
    },
    event: spidEvent,
    init: init,
    hasSession: hasSession,
    hasProduct: hasProduct,
    hasSubscription: hasSubscription,
    setTraits: setTraits,
    logout: logout
};
