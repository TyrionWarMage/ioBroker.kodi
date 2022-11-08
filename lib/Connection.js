var util = require('util');
var JSONRPCClient = require("json-rpc-2.0").JSONRPCClient;
var EventEmitter = require('events').EventEmitter;
var fetch = require('cross-fetch');

class API {
    
    constructor(host, port, user, password) {
        EventEmitter.call(this);
        this.token = Buffer.from(user + ":" + password).toString('base64');
        var self = this;
        this.client = new JSONRPCClient((jsonRPCRequest, { token }) =>
          fetch("http://" + host + ':' + port + "/jsonrpc", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "authorization": `Basic ${token}`,
            },
            body: JSON.stringify(jsonRPCRequest),
          }).then((response) => {
            if (response.status === 200) {
              // Use client.receive when you received a JSON-RPC response.
              return response
                .json()
                .then((jsonRPCResponse) => self.client.receive(jsonRPCResponse));
            } else if (jsonRPCRequest.id !== undefined) {
              return Promise.reject(new Error(response.statusText));
            }
          })
        );      
        this.closed = true;
        this.loadSchema();  
    }
    
    loadSchema() {
        var self = this;
        this.client.request('JSONRPC.Introspect',{}, { token: this.token }).then((result) => {
            self.schema = result;
            self.closed = false;   
            self.emit('connect'); 
        }).catch(err => {
            self.emit('error', err);    
        })
        
    };
    
    run(method, args={}) {
        if(!this.schema) throw new Error('Connection not initialized!');
        return this.client.request(method,args, { token: this.token });
    };
    
    notification(method, cb) {
        if(!this.schema) throw new Error('Connection not initialized!');
    
        return this.client.notify(method,args, { token: this.token }).then(cb);
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
