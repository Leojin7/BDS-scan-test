// src/telemetry/inngest-telemetry.ts
import type { InngestMiddleware } from 'inngest';

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

// Setup OpenTelemetry
const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'black-duck-security',
  }),
});

provider.addSpanProcessor(
  new BatchSpanProcessor(
    new OTLPTraceExporter({ url: 'https://otel-collector:4318/v1/traces' })
  )
);

provider.register();

// Inngest middleware for OpenTelemetry
type FunctionContext = {
  event: { name: string };
  runId: string;
};

export const otelMiddleware: InngestMiddleware<any> = {
  name: 'OpenTelemetry Middleware',
  init() {
    return {
      onFunctionRun({ fn, ctx }: { fn: { name: string }; ctx: FunctionContext }) {
        const tracer = provider.getTracer('inngest');
        const span = tracer.startSpan(`inngest.fn.${fn.name}`);

        return {
          beforeExecution() {
            // Add context to span
            span.setAttributes({
              'function.name': fn.name,
              'event.name': ctx.event.name,
              'run.id': ctx.runId,
            });
          },
          async afterExecution() {
            span.end();
          },
          async onError({ error }: { error: unknown }) {
            span.recordException(error as Error);
            span.end();
          }
        };
      }
    };
  }
};