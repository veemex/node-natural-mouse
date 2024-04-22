#include <node.h>
#include "NaturalMouseMotion.h"
#include <iostream>
#include <cstring> // For strcmp

namespace demo {
    using v8::Context;
    using v8::FunctionCallbackInfo;
    using v8::Isolate;
    using v8::Local;
    using v8::Object;
    using v8::String;
    using v8::Value;
    using v8::Exception;

    void Move(const FunctionCallbackInfo<Value>& args) {
        Isolate* isolate = args.GetIsolate();
        Local<Context> context = isolate->GetCurrentContext();

        if (args.Length() < 3) {
            std::cout << "Error: Expected at least 3 arguments, received " << args.Length() << std::endl;
            isolate->ThrowException(Exception::TypeError(
                String::NewFromUtf8(isolate, "Wrong number of arguments").ToLocalChecked()));
            return;
        }

        if (!args[0]->IsString() || !args[1]->IsNumber() || !args[2]->IsNumber()) {
            std::cout << "Error: Expected correct types for arguments (String, Number, Number)" << std::endl;
            isolate->ThrowException(Exception::TypeError(
                String::NewFromUtf8(isolate, "Wrong arguments").ToLocalChecked()));
            return;
        }

        String::Utf8Value nature(isolate, args[0]); // Assuming args[0] is a string
        std::cout << "Nature: " << *nature << ", Length: " << nature.length() << std::endl;
        int x = args[1]->NumberValue(context).FromMaybe(0);
        int y = args[2]->NumberValue(context).FromMaybe(0);

        NaturalMouseMotion::MotionNature motionNature;
        if (strcmp(*nature, "granny") == 0) {
            motionNature = NaturalMouseMotion::DefaultNature::NewGrannyNature();
        } else if (strcmp(*nature, "average") == 0) {
            motionNature = NaturalMouseMotion::DefaultNature::NewAverageComputerUserNature();
        } else if (strcmp(*nature, "robot") == 0 && args.Length() > 3 && args[3]->IsNumber()) {
            int speed = args[3]->NumberValue(context).FromMaybe(0);
            motionNature = NaturalMouseMotion::DefaultNature::NewRobotNature(speed);
        } else if (strcmp(*nature, "fastGamer") == 0) {
            motionNature = NaturalMouseMotion::DefaultNature::NewFastGamerNature();
        } else {
            std::cout << "Invalid nature type " << x << ", " << y << std::endl;

            isolate->ThrowException(Exception::TypeError(

                String::NewFromUtf8(isolate, "Invalid nature type").ToLocalChecked()));
            return;
        }



        std::cout << "Moving mouse to " << 1 << ", " << 1 << std::endl;

        NaturalMouseMotion::Move(motionNature,  x , y);

        std::cout << "Done" << std::endl;



    }

    void Initialize(Local<Object> exports) {
        NODE_SET_METHOD(exports, "move", Move);
    }

    NODE_MODULE(NODE_GYP_MODULE_NAME, Initialize)
}
