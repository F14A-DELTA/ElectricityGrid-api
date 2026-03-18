type TimeObject = {
    timestamp: string;
    timezone: string;
    duration?: number;
    duration_unit?: string;
  };
  
  type DatasetEvent = {
    time_object: TimeObject;
    event_type: string;
    attribute: unknown;
  };
  
  export type DatasetEnvelope = {
    data_source: string;
    dataset_type: string;
    dataset_id: string;
    time_object: TimeObject;
    events: DatasetEvent[];
  };
  
  type EnvelopeOptions = {
    datasetType: string;
    eventType: string;
    datasetTimestamp?: string;
    eventTimestamp?: string;
    duration?: number;
    durationUnit?: string;
  };
  
  const DATA_SOURCE = "openelectricity";
  const DEFAULT_TIMEZONE = "UTC";
  
  function getDatasetId(): string {
    const bucket = process.env.S3_BUCKET ?? process.env.OBJECT_STORAGE_BUCKET;
    const region = process.env.AWS_REGION ?? process.env.OBJECT_STORAGE_REGION ?? "us-east-1";
  
    if (!bucket) {
      return "local-cache";
    }
  
    return `http://${bucket}.s3-website-${region}.amazonaws.com`;
  }
  
  function buildTimeObject(
    timestamp: string,
    duration?: number,
    durationUnit?: string,
  ): TimeObject {
    return {
      timestamp,
      timezone: DEFAULT_TIMEZONE,
      ...(duration === undefined ? {} : { duration }),
      ...(durationUnit === undefined ? {} : { duration_unit: durationUnit }),
    };
  }
  
  export function buildDatasetEnvelope(payload: unknown, options: EnvelopeOptions): DatasetEnvelope {
    const datasetTimestamp = options.datasetTimestamp ?? new Date().toISOString();
    const eventTimestamp = options.eventTimestamp ?? datasetTimestamp;
  
    return {
      data_source: DATA_SOURCE,
      dataset_type: options.datasetType,
      dataset_id: getDatasetId(),
      time_object: buildTimeObject(datasetTimestamp),
      events: [
        {
          time_object: buildTimeObject(eventTimestamp, options.duration, options.durationUnit),
          event_type: options.eventType,
          attribute: payload,
        },
      ],
    };
  }
  