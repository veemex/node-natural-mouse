const naturalMouseMotion = require('../lib');


try {
    // Attempt to call the 'move' function with appropriate arguments.


    for (let i = 0; i < 10; i++) {
        naturalMouseMotion.move('fastGamer', Math.random() * 1000, Math.random() * 1000, 100);
        naturalMouseMotion.move('fastGamer', Math.random() * 1000, Math.random() * 1000, 100);
    }
    console.log("Move command issued successfully.");
} catch (error) {
    console.error("Error calling move:", error);
}

