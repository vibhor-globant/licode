#ifndef BUILDING_NODE_EXTENSION
#define BUILDING_NODE_EXTENSION
#endif
#include <node.h>
#include <nan.h>
#include "WebRtcConnection.h"
#include "OneToManyProcessor.h"
#include "OneToManyTranscoder.h"
#include "ExternalInput.h"
#include "ExternalOutput.h"

using namespace v8;

void InitAll(Handle<Object> target) {
  WebRtcConnection::Init(target);
  OneToManyProcessor::Init(target);
  OneToManyTranscoder::Init(target);
  ExternalInput::Init(target);
  ExternalOutput::Init(target);
}

NODE_MODULE(addon, InitAll)
