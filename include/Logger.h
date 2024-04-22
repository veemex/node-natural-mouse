#pragma once

#include <memory>
#include <string>
#include <cstdarg>
#include <list>
#include <functional>

namespace NaturalMouseMotion
{

using LoggerPrinterFunc = std::function<void(const std::string)>;

struct Logger
{
    static void Print(LoggerPrinterFunc printer, const std::string fmt, ...)
    {
        if (!printer)
            return;


    }
};
} // namespace NaturalMouseMotion