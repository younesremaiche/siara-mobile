const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
    const token = req.cookies.accessToken; // Read the token from cookies
    
    if (token) {
        jwt.verify(token, process.env.JWT_ACCESSTOKEN, (err, user) => {
            if (err) {
                res.status(403).json({ error: "Token is not valid!" });
            } else {
                req.user = user;
               
                next();
            }
        });
    } else {
        res.status(401).json({ error: "You are not authenticated!" });
    }
};









const verifyTokenAndAdmin = (req, res, next) => {
    verifyToken(req, res, () => {
        if (req.user.userRole === 1) {
            next();
        } else {
            res.status(403).json({ error: "You are not allowed to do that!" });
        }
    });
};

const verifyTokenAndClient = (req, res, next) => {
    verifyToken(req, res, () => {
        if (req.user.userRole === 0) {
            next();
        } else {
            res.status(403).json({ error: "You are not allowed to do that!" });
        }
    });
};

module.exports = {verifyTokenAndClient, verifyToken,verifyTokenAndAdmin  };