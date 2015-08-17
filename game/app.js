var express = require('express');

var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var q = require('q');
var json = require('jsonify');
var async = require('async');
var redis = require('redis');
var moment = require('moment');
var forwarded = require('forwarded');
var debug = require('debug');

var app = express();
var redisClient = redis.createClient();
var server = require('http').createServer(app);
var io = require('socket.io')(server);


// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

var usernames = {};
var rooms = ['room1','room2'];

io.total = 0;

io.on('connection', function(socket){

  var req = socket.request;
  var ip = forwarded(req, req.headers);

  console.log('client ip %s', ip);

  socket.on('adduser', function(username){
    socket.username = username;
    socket.room = 'room1';
   
    var time = timeNow();

    var jUser = {
      "ip": ip,
      "jointime": time,
      "user": socket.username,
      "room": socket.room,
      "messages": {
        "mTime": [],
        "message": [],
      },
      "dice": [],
    };
    
    redisClient.set(socket.username, jsonIt(jUser));
    redisClient.rpush(socket.room, 'first');

    socket.join('room1');
    socket.emit('updatechat', 'SERVER', 'you have connected to room1 with ip: '+ip, timeNow());
    socket.broadcast.to('room1').emit('updatechat', 'SERVER', username + ' has connected to this room with ip: '+ ip, timeNow());
    socket.emit('updaterooms',rooms,'room1');
  });

  socket.on('sendchat', function (data) {
    
    var timeIt = timeNow();
    var redisData = null;
    var diceResult = diceRoll();
    
    jsonFetch(socket.username).
    then(function(value){
      redisData = json.parse(value);
      redisData["messages"]["message"].push(data.toString());
      redisData["messages"]["mTime"].push(timeIt);
      redisData["dice"].push(diceResult);
      redisClient.set(socket.username, jsonIt(redisData));
    }, function(error){
      console.log(error);
    });
    
    io.sockets.in(socket.room).emit('updatechat', socket.username, data + " UserScore: " + getUserScore(socket.username), timeNow());
  });
  
  socket.on('diceRoll', function (){
    //--seeda room if nonexist
    //var eventSource = ['diceRoll', socket.username, diceRoll()].toString();
    redisClient.rpush(socket.room, 'diceRoll', function(err){
      console.log("DiceRoll PUSH error: " + err);
    });  
  });

  socket.on('switchRoom', function(newroom){
    socket.leave(socket.room);
    socket.join(newroom);
    socket.emit('updatechat', 'SERVER', ' connected to ' + newroom);
    socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.username+' has left');
    socket.room = newroom;
    socket.broadcast.to(newroom).emit('updatechat', 'SERVER', socket.username+' has joined this room');
    socket.emit('updaterooms', rooms, newroom);
    usernames[socket.username]["room"] = newroom;
  });
  socket.on('disconnect', function(){
    delete usernames[socket.username];
    io.sockets.emit('updateusers', usernames);
    socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has disconnected');
    socket.leave(socket.room);
  });

  //socket.on('event', function(data){});
  //socket.on('disconnect', function(){});
});

function timeNow(){
  return moment().format('HH:mm:ss');
};

function timeId(username){
  return timeNow()+'-'+username;
};

function diceRoll(){
  return Math.floor((Math.random() * 6)+1);
};

function getUserScore(username){
  var score = 0;
  var rediScore = null;
  jsonFetch(username).
    then(function(value){
      rediScore = json.parse(value)["dice"];
      console.log("GetUserValue: " + rediScore);
      return score;
    },function(error){
      console.log(error);
    });
};


function addUser(username, ip, onlineStatus){
};

function getUser(username){
};

function statusUser(username, ip, onlineStatus){
};

function updateRoomCount(){
};

function jsonIt(obj){
  var result = json.stringify(obj);
  console.log(result);
  return result
};

function jsonFetch(key){
  var deferred = q.defer();
  redisClient.get(key, function(err, value){
    if(err){
      deferred.reject(new Error(err));
    }else{
      deferred.resolve(value);
    }
  });
      
  return deferred.promise
};

function jsonReturn(key){
  jsonFetch(key)
  .then(function(value){
    return json.parse(value);
  },function(error){
    callback(error);
  },function(progress){
    console.log("Progress: "+progress);
  });
};

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;

server.listen(3000);
