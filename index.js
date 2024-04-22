const naturalMouseMotion = require('./build/Release/natural_mouse_motion');

module.exports = {
    move: (nature, x, y) => {
        naturalMouseMotion.move(nature, x, y);
    }
};