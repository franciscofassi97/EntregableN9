const express = require("express");
require("dotenv").config();
const util = require("util");
const { engine } = require("express-handlebars");

const session = require("express-session");
const cookieParser = require("cookie-parser");
const MongoStore = require("connect-mongo");

const app = express();
const PORT = process.env.PORT || 8080;

// faker
const { prodoductos } = require("./faker/index");
const definirContenedor = require("./daos/index");

const { Server: HttpServer } = require("http");
const { Server: IoServer } = require("socket.io");
const httpServer = new HttpServer(app);
const ioSocket = new IoServer(httpServer);

//Normalizr
const normalizr = require("normalizr");

const autorSchema = new normalizr.schema.Entity("autor", {}, { idAttribute: "mail" });
const mensajesSchema = new normalizr.schema.Entity("mensajes", {
    autor: autorSchema,
});



//Midlleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.use(cookieParser());

app.use(session({
    store: new MongoStore({
        mongoUrl: process.env.MONGO_DB,
    }),
    secret: "algunSecrete",
    resave: true,
    saveUninitialized: true,
    cookie: {
        maxAge: 60000,
    }
}))


//App Views
app.engine(
    "hbs",
    engine({
        extname: "hbs",
        defaultLayout: "main",
        layoutsDir: __dirname + "/views/layouts", ///Posiblee barra si no anda
        partialsDir: __dirname + "/views/partials"
    })
);

app.set("view engine", "hbs");
app.set("views", "./views");

app.get("/", (req, res) => {
    res.redirect("/api/productos");
});

app.get("/api/productos", (req, res) => {
    if (req.session.nombreUsuario) {
        res.render("formProducts", { nombreUsuario: req.session.nombreUsuario });
    } else {
        res.render("loginForm")
    }
});

app.get("/api/productos-test", (req, res) => {
    res.render("tableProductsTest", { products: prodoductos(5) })

});


app.post("/api/productos/login", (req, res) => {
    const { nombreUsuario } = req.body;
    if (nombreUsuario) {
        req.session.nombreUsuario = nombreUsuario;
        res.redirect("/api/productos");
    } else {
        res.redirect("/api/productos");
    }
});

app.post("/api/productos/logout", (req, res) => {
    const nombreUsuario = req.session.nombreUsuario;
    // res.render("adios", { nombreUsuario: req.session.nombreUsuario });

    req.session.destroy(err => {
        if (err) {
            console.log(err)
        } else {
            res.render('adios', { nombreUsuario })
            res.set({ 'Refresh': '3; url=/api/productos' });
        }
    });
});

// --------SOKETS-------------
ioSocket.on("connection", async (socket) => {
    console.log("New cliente connected");

    const contenedorProductos = await definirContenedor("productos");
    const contenedorMensajes = await definirContenedor("mensajes");

    const mensajesNormalizado = normalizr.normalize(await contenedorMensajes.getAllData(), [mensajesSchema]);


    socket.emit("productos", await contenedorProductos.getAllData());
    socket.emit("leerMensajes", mensajesNormalizado);


    //Prodcutos 
    socket.on("agregarProducto", async (producto) => {
        const idProducto = await contenedorProductos.save(producto);
        console.log(idProducto)
        if (idProducto) ioSocket.sockets.emit("leerProductos", await contenedorProductos.getAllData());
    })

    //Chat
    socket.on("agregarMensaje", async (mensaje) => {
        const idMensaje = await contenedorMensajes.save(mensaje);
        const mensajesNormalizado = normalizr.normalize(await contenedorMensajes.getAllData(), [mensajesSchema]);

        if (idMensaje) ioSocket.sockets.emit("leerMensajes", mensajesNormalizado);

    })
})


httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

