var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);

server.listen(3000);

// global variables for the server
var playerSpawnPoints = [];
var clients = [];
var tradeRecord = [];
var offerRecord = [];

app.get('/', function(req, res) {
	res.send('hey you got back get "/"');
});

io.on('connection', function(socket) {
	
	var currentPlayer = {};
	currentPlayer.name = 'unknown';

	socket.on('player connect', function() {
		console.log(currentPlayer.name+' recv: player connect');
		for(var i =0; i<clients.length;i++) {
			var playerConnected = {
				name:clients[i].name,
				position:clients[i].position,
				rotation:clients[i].position,
                socket:clients[i].socket,
                tradeState:clients[i].tradeState,
			};
			// in your current game, we need to tell you about the other players.
			socket.emit('other player connected', playerConnected);
			console.log(currentPlayer.name+' emit: other player connected: '+JSON.stringify(playerConnected));
		}
	});

	socket.on('play', function(data) {
		console.log(currentPlayer.name+' recv: play: '+JSON.stringify(data));
		// if this is the first person to join the game init the enemies
		if(clients.length === 0) {
			playerSpawnPoints = [];
			data.playerSpawnPoints.forEach(function(_playerSpawnPoint) {
				var playerSpawnPoint = {
					position: _playerSpawnPoint.position,
					rotation: _playerSpawnPoint.rotation
				};
				playerSpawnPoints.push(playerSpawnPoint);
			});
		}

		var randomSpawnPoint = playerSpawnPoints[Math.floor(Math.random() * playerSpawnPoints.length)];
		currentPlayer = {
			name:data.name,
			position: randomSpawnPoint.position,
			rotation: randomSpawnPoint.rotation,
            socket: socket.id,
            tradeState: false,
            tradeInfo: {
                playerTo: null,
                element: null,
                amount: null
            }
		};
		clients.push(currentPlayer);
		// in your current game, tell you that you have joined
		console.log(currentPlayer.name+' emit: play: '+JSON.stringify(currentPlayer));
		socket.emit('play', currentPlayer);
		// in your current game, we need to tell the other players about you.
		socket.broadcast.emit('other player connected', currentPlayer);
	});

	socket.on('player move', function(data) {
		currentPlayer.position = data.position;
		socket.broadcast.emit('player move', currentPlayer);
	});

	socket.on('player turn', function(data) {
		console.log('recv: turn: '+JSON.stringify(data));
		currentPlayer.rotation = data.rotation;
		socket.broadcast.emit('player turn', currentPlayer);
	});
    
    socket.on('cancel trade', function(data) {
        for(var i =0; i< clients.length;i++) {
            if(data.playerFrom == clients[i].name) {
                if(clients[i].tradeState) {
                    clients[i].tradeState = false;
                }
            }
        }
    });
    
    socket.on('reject trade', function(data) {
        for(var i =0; i< clients.length;i++) {
            if(data.playerFrom == clients[i].name) {
                if(clients[i].tradeState) {
                    clients[i].tradeState = false;
                    
                    socket.broadcast.to(clients[i].socket).emit('trade rejected', data);
                }
            }
        }
        socket.emit('trade rejected', data);
    });

    socket.on('cancel trade', function(data) {
        var cancelPlayerTo;
        for(var i =0; i< clients.length;i++) {
            if(data.playerFrom == clients[i].name) {
                    clients[i].tradeState = false;
                    cancelPlayerTo = clients[i].tradeInfo.playerTo;
                    console.log('cancel player name: '+ clients[i].tradeInfo.playerTo);
            }
        }
        for(var i =0; i< clients.length;i++) {
            if(cancelPlayerTo == clients[i].name) {
                clients[i].tradeState = false;
                
                socket.broadcast.to(clients[i].socket).emit('trade rejected', data);
            }
        }
        socket.emit('trade rejected', data)
    });
    
	socket.on('accept trade', function(data) {
		// checking the originating player
		if(data.playerFrom === currentPlayer.name) {
            clients = clients.map(function(client, index) {
                if(client.name === data.playerFrom) {
                    client.tradeState = true;
                    client.tradeInfo.playerTo = data.playerTo;
                    client.tradeInfo.element = data.element;
                    client.tradeInfo.amount = data.amount;
                }
                return client;
            });
        }
        for(var i =0; i<clients.length;i++) {
            if(data.playerTo == clients[i].name) {
                if(clients[i].tradeState) {
                    if(clients[i].tradeInfo.playerTo == data.playerFrom) {
                        var localResponse = {
                            removeElement: data.element,
                            removeAmount: data.amount,
                            addElement: clients[i].tradeInfo.element,
                            addAmount: clients[i].tradeInfo.amount,
                            panelObject: data.panelObject
                        };
                        var clientResponse = {
                            removeElement: clients[i].tradeInfo.element,
                            removeAmout: clients[i].tradeInfo.amount,
                            addElement: data.element,
                            addAmount: data.amount,
                            panelObject: data.panelObject
                        };
                                                
                        var trade = {
                            playerFrom: {
                                name: clients[i].name,
                                element: clients[i].tradeInfo.element,
                                amount: clients[i].tradeInfo.amount
                            },
                            playerTo: {
                                name: data.playerFrom,
                                element: data.element,
                                amount: data.amount
                            }
                        }
                        
                        tradeRecord.push(trade);
                                          
                        socket.emit('change inventory', clientResponse);
                        socket.broadcast.to(clients[i].socket).emit('change inventory', localResponse);
                        
                        // Reset both players' tradeStates and tradeInfo
                        clients[i].tradeState = false;
                        clients[i].tradeInfo.playerTo = null;
                        clients[i].tradeInfo.element = null;
                        clients[i].tradeInfo.amount = null;
                        
                        if(data.playerFrom === currentPlayer.name) {
                            clients = clients.map(function(client, index) {
                                if(client.name === data.playerFrom) {
                                    client.tradeState = false;
                                    client.tradeInfo.playerTo = null;
                                    client.tradeInfo.element = null;
                                    client.tradeInfo.amount = null;
                                }
                                return client;
                            });
                        }                        
                    } else {
                        var response = {
                            playerTo: clients[i].name,
                            playerFrom: data.playerFrom,
                            panelObject: data.panelObject
                        }
                        socket.emit('trade not available', response);
                    }
                } else {
                    var response = {
                        playerFrom: data.playerFrom,
                        addElement: data.element,
                        addAmount: data.amount,
                        panelObject: data.panelObject,
                    }
                    socket.emit('trade pending', data);
                    socket.broadcast.to(clients[i].socket).emit('trade available', response);
                }
            }
        }

	});
    
	socket.on('disconnect', function() {
		console.log(currentPlayer.name+' recv: disconnect '+currentPlayer.name);
		socket.broadcast.emit('other player disconnected', currentPlayer);
		console.log(currentPlayer.name+' bcst: other player disconnected '+JSON.stringify(currentPlayer));
		for(var i=0; i<clients.length; i++) {
			if(clients[i].name === currentPlayer.name) {
				clients.splice(i,1);
			}
		}
	});
    
    socket.on('chat', function (data){
        socket.emit('chatdata', data);
        socket.broadcast.emit('chatdata', data);
    });

    socket.on('give', function (data){
        if(data.playerFrom === currentPlayer.name) {
            clients = clients.map(function(client, index) {
                if(client.name === data.playerFrom) {
                    client.tradeState = false;
                    client.tradeInfo.element = data.element;
                    client.tradeInfo.amount = data.amount;
                }
                return client;
            });
        }
        
        socket.broadcast.emit('give', data); 
    });
    
    socket.on('construct tile', function (data){
        console.log(data);
        socket.broadcast.emit('construct tile all', data);
    });
    
});

console.log('--- server is running ...');

function guid() {
	function s4() {
		return Math.floor((1+Math.random()) * 0x10000).toString(16).substring(1);
	}
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}