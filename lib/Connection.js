var util = require('util');
var jrpc = require('jrpc-schema');
var WebSocket = require('ws');
var EventEmitter = require('events').EventEmitter;
var set = require('set-value');
var has = require('has-value');

class API {
    
    constructor(host, port, user, password) {
        EventEmitter.call(this);
    
        this.socket = new WebSocket('ws://' + user + ":" + password + "@" + host + ':' + port + '/jsonrpc');
        this.closed = true;
        this.init();   
    }

    init() {
        this.socket.setMaxListeners(0);
        var self = this;
        this.socket.on('open', function() {
            self.loadSchema().then(function(schema) {
                self.schema = new jrpc.Schema(schema, function(message) {
                    self.socket.send(message);
                });
    
                self.socket.on('message', function(message) {
                    try {
                        self.schema.handleResponse(message);
                    } catch(err) {
                        err.message = 'Failed to handle response: ' + err.message;
                        self.emit('error', err);
                    }
                });
    
                self.addShortcuts();
                self.closed = false;
                self.emit('connect');
            }).catch(function(err) {
                err.message = 'Schema error: ' + err.message;
                self.emit('error', err);
            });
        });
                
        this.socket.on('close', function() {
            self.closed = true;
            self.emit('close');
        });
                    
        this.socket.on('error', function(err) {
            err.message = 'Socket error: ' + err.message;
            self.emit('error', err);
        });

    };
    
    loadSchema() {
        var self = this;
        var fetchSchema = jrpc.run('JSONRPC.Introspect', [], this.socket.send.bind(this.socket));
        this.socket.on('message', fetchSchema.handle);
    
        return fetchSchema.then(function(schema) {
            self.socket.removeListener('message', fetchSchema.handle);
            return schema;
        });
    };
    
    addShortcuts() {
        var self = this;
    
        Object.keys(this.schema.schema.methods).forEach(function(method) {
            if(!has(self, method)) {
                set(self, method, self.schema.schema.methods[method]);
            }
        });
    
        Object.keys(this.schema.schema.notifications).forEach(function(method) {
            if(!has(self, method)) {
                set(self, method, self.schema.schema.notifications[method]);
            }
        });
    };
    
    batch() {
        var rawBatch = this.schema.batch();
        var batch = {
            send: rawBatch.send.bind(rawBatch)
        };
    
        Object.keys(rawBatch.schema.methods).forEach(function(method) {
            if(!has(batch, method)) {
                set(batch, method, rawBatch.schema.methods[method]);
            }
        });
    
        return batch;
    };
    
    run(method) {
        if(!this.schema) throw new Error('Connection not initialized!');
    
        var args = Array.prototype.slice.call(arguments, 1);
        var methods = this.schema.schema.methods;
    
        return methods[method].apply(methods, args);
    };
    
    notification(method, cb) {
        if(!this.schema) throw new Error('Connection not initialized!');
    
        return this.schema.schema.notifications[method](cb);
    };

}

util.inherits(API, EventEmitter);

function connect(host, port, user=null,password=null) {
    return new Promise(function(resolve, reject) {
        var connection = new API(host, port, user, password);

        connection.on('error', reject);
        connection.on('connect', function() {
            //Remove the handler so we dont try to reject on any later errors
            connection.removeListener('error', reject);

            resolve(connection);
        });
    });
}

module.exports = connect;
