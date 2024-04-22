const naturalMouseMotion = require('./build/Release/natural_mouse_motion');


try {
    // Attempt to call the 'move' function with appropriate arguments.


    for (let i = 0; i < 10; i++) {
        naturalMouseMotion.move('fastGamer', Math.random() * 2000, Math.random() * 2000, 100);
        naturalMouseMotion.move('fastGamer', Math.random() * 2000, Math.random() * 2000, 100);
    }
    console.log("Move command issued successfully.");
} catch (error) {
    console.error("Error calling move:", error);
}

