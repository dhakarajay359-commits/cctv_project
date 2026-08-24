import json
import logging
import os
import time

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("NirikshanKafkaProducer")

class AlertBusPublisher:
    """
    Publisher for Nirikshan Layer 5 Kafka Alert & Event Bus.
    Routes real-time YOLOv8 detections and ANPR events across Gujarat state agencies.
    """
    def __init__(self, bootstrap_servers=None):
        self.bootstrap_servers = bootstrap_servers or os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        self.producer = None
        self._init_producer()

    def _init_producer(self):
        try:
            from kafka import KafkaProducer
            self.producer = KafkaProducer(
                bootstrap_servers=self.bootstrap_servers.split(","),
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
                acks="all",
                retries=3,
                request_timeout_ms=5000
            )
            logger.info(f"Connected to Kafka Alert Bus at {self.bootstrap_servers}")
        except Exception as e:
            logger.warning(f"Kafka unavailable at {self.bootstrap_servers} ({e}). Running in localized buffer mode.")
            self.producer = None

    def publish_detection_event(self, topic: str, payload: dict, key: str = None) -> bool:
        """
        Publishes a detection event (thin JSON metadata) to Kafka topic (e.g. gujarat.vision.inferences).
        """
        payload["timestamp_emitted"] = payload.get("timestamp_emitted", time.time())
        
        if self.producer:
            try:
                future = self.producer.send(topic, key=key or payload.get("camera_id"), value=payload)
                self.producer.flush(timeout=1.0)
                logger.info(f"Published detection event to [{topic}] | Camera: {payload.get('camera_id')} | Classes: {payload.get('detected_classes')}")
                return True
            except Exception as e:
                logger.error(f"Failed to publish to Kafka: {e}")
                return False
        else:
            # Local fallback logging when Kafka is offline
            logger.info(f"[LOCAL EVENT BUS FALLBACK] Topic: {topic} | Data: {payload}")
            return True

    def close(self):
        if self.producer:
            self.producer.close()
