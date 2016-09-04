var Manager = require('./manager.js');
var http = require("http");

var ProviderEngine = require("web3-provider-engine");
var FilterSubprovider = require('web3-provider-engine/subproviders/filters.js');

var GethDefaults = require("ethereumjs-testrpc/lib/subproviders/gethdefaults.js");

Server = {
  server: function(options) {
    if (options == null) {
      options = {};
    }

    if (options.logger == null) {
      options.logger = console;
    }

    var logger = options.logger;
    var provider = this.provider(options);
    var server = http.createServer(function(request, response) {

      var headers = request.headers;
      var method = request.method;
      var url = request.url;
      var body = [];

      request.on('error', function(err) {
        console.error(err);
      }).on('data', function(chunk) {
        body.push(chunk);
      }).on('end', function() {
        body = Buffer.concat(body).toString();
        // At this point, we have the headers, method, url and body, and can now
        // do whatever we need to in order to respond to this request.

        var headers = {
          "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "*"
        };

        switch (method) {
          case "OPTIONS":
            headers["Content-Type"] = "text/plain"
            response.writeHead(200, headers);
            response.end("");
            break;
          case "POST":
            //console.log("Request coming in:", body);

            var payload;
            try {
              payload = JSON.parse(body);
            } catch(e) {
              headers["Content-Type"] = "text/plain";
              response.writeHead(400, headers);
              response.end("400 Bad Request");
              return;
            }

            // Log messages that come into the TestRPC via http
            if (payload instanceof Array) {
              // Batch request
              for (var i = 0; i < payload.length; i++) {
                var item = payload[i];
                logger.log(item.method);
              }
            } else {
              logger.log(payload.method);
            }

            provider.sendAsync(payload, function(err, result) {
              headers["Content-Type"] = "application/json";
              response.writeHead(200, headers);
              response.end(JSON.stringify(result));
            });

            break;
          default:
            response.writeHead(400, {
              "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "*",
              "Content-Type": "text/plain"
            });
            response.end("400 Bad Request");
            break;
        }
      });
    });

    var oldListen = server.listen;

    server.listen = function() {
      var args = Array.prototype.slice.call(arguments);
      var callback = function() {};
      if (args.length > 0) {
        var last = args[args.length - 1];
        if (typeof last == "function") {
          callback = args.pop();
        }
      }

      var intermediary = function(err) {
        if (err) return callback(err);
        server.provider.manager.waitForInitialization(function(err, accounts) {
          callback(err, accounts);
        });
      };

      args.push(intermediary);

      oldListen.apply(server, args);
    }

    server.provider = provider;

    // // TODO: the reviver option is a hack to allow batches to work with jayson
    // // it become unecessary after the fix of this bug https://github.com/ethereum/web3.js/issues/345
    // var server = jayson.server(functions, {
    //   reviver: function(key, val) {
    //     if (typeof val === 'object' && val.hasOwnProperty('method') &&
    //         val.method === 'eth_call' && val.hasOwnProperty('params') &&
    //         val.params.constructor === Array && val.params.length === 1)
    //       val.params.push('latest');
    //     return val;
    //   }
    // });

    return server;
  },

  // TODO: Make this class-like to allow for multiple providers?
  provider: function(options) {
    var self = this;

    if (options == null) {
      options = {};
    }

    if (options.logger == null) {
      options.logger = {
        log: function() {}
      };
    }

    var engine = new ProviderEngine();

    var manager = new Manager(options);
    manager.initialize();

    engine.manager = manager;
    engine.addProvider(new FilterSubprovider());
    engine.addProvider(new GethDefaults());
    engine.addProvider(manager);
    engine.setMaxListeners(100);
    engine.start();

    var externalize = function(payload) {
      var clone = {};
      var keys = Object.keys(payload);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        clone[key] = payload[key];
      }
      clone.external = true;
      return clone;
    };

    // Mimic the provider interface, marking requests as external.
    return {
      manager: manager,
      sendAsync: function(payload, callback) {

        if (Array.isArray(payload)) {
          for (var i = 0; i < payload.length; i++) {
            payload[i] = externalize(payload[i]);
          }
        } else {
          payload = externalize(payload);
        }

        engine.sendAsync(payload, (err, res) => {
          callback(err, res);
        });
      },
      send: function() {
        throw new Error("Synchronous requests are not supported.");
      },
      stop: function (cb) {
        engine.stop();
        manager.blockchain.dhInterface &&
        manager.blockchain.dhInterface.close(cb);
      }
    };
  }
}

module.exports = Server;
