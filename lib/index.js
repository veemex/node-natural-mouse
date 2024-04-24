const naturalMouseMotion = require('../build/Release/natural_mouse_motion');

module.exports = {
    move: (nature, x, y, speed= 10) => {
        naturalMouseMotion.move(nature, x, y, speed);
    }
};