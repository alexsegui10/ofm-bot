import pino from 'pino';

const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';

export const logger = pino(
  {
    level: isDev ? 'debug' : 'info',
    base: { service: 'ofm-bot' },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(isDev && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname,service',
        },
      },
    }),
  },
);

/**
 * Returns a child logger scoped to a specific agent.
 * All log lines from that agent will carry { agent: name }.
 */
export function agentLogger(name) {
  return logger.child({ agent: name });
}
