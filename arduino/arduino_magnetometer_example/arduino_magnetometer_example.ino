#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_HMC5883_U.h>

/* Assign a unique ID to this sensor at the same time */
Adafruit_HMC5883_Unified mag = Adafruit_HMC5883_Unified(12345);

void setup(void) {
  Serial.begin(115200);
  if(!mag.begin()) {
    /* There was a problem detecting the HMC5883L ... check your connections */
    while(1);
  }
}

void loop(void) {
  sensors_event_t event; 
  mag.getEvent(&event);

  // Send data as a JSON string for easy web parsing
  Serial.print("{\"x\":"); Serial.print(event.magnetic.x);
  Serial.print(", \"y\":"); Serial.print(event.magnetic.y);
  Serial.print(", \"z\":"); Serial.print(event.magnetic.z);
  Serial.println("}");

  delay(50); // ~20Hz update rate
}