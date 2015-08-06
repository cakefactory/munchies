var express = require('express');

var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

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
    usernames[username] = username;
    socket.join('room1');
    socket.emit('updatechat', 'SERVER', 'you have connected to room1 with ip: '+ip, timeNow());
    socket.broadcast.to('room1').emit('updatechat', 'SERVER', username + ' has connected to this room with ip: '+ ip, timeNow());
    socket.emit('updaterooms', rooms, 'room1');

    if(redisClient.exists(username) == false){
      addUser(username, ip, true);
      console.log("User added: " + username);
    }else{
      statusUser(username, ip, true);
      console.log("User status: " + username + " Online: " + getUser(username));
    };

  });

  socket.on('sendchat', function (data) {
    var diceRoll = Math.floor((Math.random() * 6)+1);
    io.sockets.in(socket.room).emit('updatechat', socket.username, data + diceRoll, timeNow());
  });
  
  socket.on('diceRoll', function (username){
  });

  socket.on('switchRoom', function(newroom){
    socket.leave(socket.room);
    socket.join(newroom);
    socket.emit('updatechat', 'SERVER', ' connected to ' + newroom);
    socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.username+' has left');
    socket.room = newroom;
    socket.broadcast.to(newroom).emit('updatechat', 'SERVER', socket.username+' has joined this room');
    socket.emit('updaterooms', rooms, newroom);
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
  return moment().format('HH:mm');
};

function addUser(username, ip, onlineStatus){
  redisClient.set(
      username, 
      {
        "ip":ip,
        "score":0,
        "online":onlineStatus,
        "room":null,
      }
  );
  
  console.log("Added " + username + " toRedis");
};

function getUser(username){
  redisClient.get(username, function(err, obj){
    if(err){console.log(err)};
    console.dir(obj);
  });
};

function statusUser(username, ip, onlineStatus){
  redisClient.set(
      username,
      {
        "ip":ip,
        "online":onlineStatus,
        "room":null,
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
