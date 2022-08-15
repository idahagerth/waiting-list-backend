const http = require("http");
const { Server } = require("socket.io");
const { instrument } = require("@socket.io/admin-ui");

const server = http.createServer();
const knex = require("./db");
const PORT = process.env.PORT

// Socket io admin

const io = new Server(server, {
  cors: {
    origin: ["https://waiting-list-client-ida.herokuapp.com/"],
    credentials: false
  },
});

// Init admin
instrument(io, {
  auth: false,
});
/**
 * Lägga till:
 * - Databas
 *   - Lägga till en databas
 *   - Lägga till tabeller/schema
 * - Autentisering ?
 * - Anonym hjälp/samarbete
 *   - Matcha två personer ihop
 */

/**
 * Waiting[]:
 * name: string
 * sid: socket.id
 */

let waiting = [];

/**
 * Msg:
 * timestamp: date
 * name: string
 * room: string
 * color: string
 */

io.on("connection", async (socket) => {
  console.log("A user connected");

  socket.emit("matchmake:notify", waiting.length)

  socket.emit(
    "new",
    await knex("help_requests").select("*").where("done", false)
  );

  socket.on("help", async (req) => {
    if (!req.name || !req.room) {
      return socket.emit("error", "Must send name, room");
    }

    await knex("help_requests").insert({ name: req.name, room: req.room });
    const result = await knex("help_requests").select("*").where("done", false);
    io.emit("new", result);
  });

  // "matchmake:join"
  // visar om någon väntar
  socket.on("matchmake:join", ({ name }) => {
    if (waiting.find((x) => x.sid === socket.id) === undefined) {
      waiting.push({ sid: socket.id, name });
    }
    io.emit("matchmake:notify", waiting.length);

    if (waiting.length > 1) {
      waiting.forEach((x) => io.to(x.sid).emit("matchmake:update", waiting));
    }
  });

  socket.on("matchmake:done", () => {
    waiting = [];

    io.emit("matchmake:notify", 0);
  });

  // "matchmake:complete"
  // skicka till båda användare

  socket.on("done", async ({ id }) => {
    await knex("help_requests").where({ id: id }).update({ done: true });

    io.emit(
      "new",
      await knex("help_requests").select("*").where("done", false)
    );
  });

  socket.onAny((event, ...args) => {
    console.log(event, args);
  })
  
  socket.on("disconnect", () => {
    const foundInWaiting = waiting.find((x) => x.sid === socket.id);
    if (foundInWaiting) {
      waiting = waiting.filter(x => x.sid !== socket.id);
    }

    io.emit("matchmake:notify", waiting.length);
    if (waiting.length > 0) {
      waiting.forEach((x) => io.to(x.sid).emit("matchmake:update", waiting));
    }
  })
});

server.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});
