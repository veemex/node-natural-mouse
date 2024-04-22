{
     "targets": [
       {
         "target_name": "natural_mouse_motion",
         "sources": ["src/main.cpp"],
         "include_dirs": ["include"],
         "cflags!": ["-fno-exceptions"],
         "cflags_cc!": ["-fno-exceptions"],
         "xcode_settings": {
           "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
           "CLANG_CXX_LIBRARY": "libc++",
           "MACOSX_DEPLOYMENT_TARGET": "10.7"
         },
         "msvs_settings": {
           "VCCLCompilerTool": {
             "ExceptionHandling": 1
           }
         }
       }
     ]
}