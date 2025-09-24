const express = require("express");
const http = require("http");
const cors = require("cors");
const app = express();
const server = http.createServer(app);
const socket = require("socket.io");
const io = require("socket.io")(server, {
  cors: {
    origin: process.env.ORIGIN || "*",
  },
});

const users = {};

const PORT = process.env.PORT || 5000;

const socketToRoom = {};

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);
  
  socket.on("join room", ({ roomID, user }) => {
    console.log(`User ${socket.id} joining room ${roomID}`, user);
    
    // Join the socket.io room
    socket.join(roomID);
    
    if (users[roomID]) {
      users[roomID].push({ userId: socket.id, user });
    } else {
      users[roomID] = [{ userId: socket.id, user }];
    }
    socketToRoom[socket.id] = roomID;
    const usersInThisRoom = users[roomID].filter(
      (user) => user.userId !== socket.id
    );

    console.log(`Room ${roomID} now has ${users[roomID].length} users:`, users[roomID]);
    console.log(`Sending ${usersInThisRoom.length} existing users to ${socket.id}`);
    
    // Send existing users to the new user
    socket.emit("all users", usersInThisRoom);
    
    // Notify existing users about the new user (this will trigger peer connections)
    if (usersInThisRoom.length > 0) {
      console.log(`Notifying existing users about new user ${socket.id}`);
      socket.to(roomID).emit("user joined", {
        signal: null, // Signal will be sent separately
        callerID: socket.id,
        user: user,
      });
    }
  });

  // signal for offer
  socket.on("sending signal", (payload) => {
    console.log(`Signal from ${payload.callerID} to ${payload.userToSignal}`);
    socket.to(payload.userToSignal).emit("user joined", {
      signal: payload.signal,
      callerID: payload.callerID,
      user: payload.user,
    });
  });

  // signal for answer
  socket.on("returning signal", (payload) => {
    console.log(`Returning signal from ${socket.id} to ${payload.callerID}`);
    socket.to(payload.callerID).emit("receiving returned signal", {
      signal: payload.signal,
      id: socket.id,
    });
  });

  // send message
  socket.on("send message", (payload) => {
    io.emit("message", payload);
  });

  // disconnect
  socket.on("disconnect", () => {
    console.log(`User ${socket.id} disconnected`);
    const roomID = socketToRoom[socket.id];
    let room = users[roomID];
    if (room) {
      room = room.filter((item) => item.userId !== socket.id);
      users[roomID] = room;
      console.log(`Room ${roomID} now has ${room.length} users`);
      
      // Notify other users in the room
      socket.to(roomID).emit("user left", socket.id);
    }
    delete socketToRoom[socket.id];
  });
});

console.clear();

server.listen(PORT, () =>
  console.log(`Server is running on port http://localhost:${PORT}`)
);
