import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { isOk } from '@study-studio/shared';
import { formatBusinessErrorResponse } from '../../../errors/http-error-handler.js';
import {
  listProxyVoices,
  synthesizeViaProxy,
  validateProxyCredentials,
} from '../application/tts-proxy.js';

/**
 * TTS 代理路由：浏览器只连网关，由网关直调第三方语音服务。
 * API Key 随请求传入、调用完即弃，网关不落盘、不记日志。
 */
export function createTtsRoutes() {
  return new Hono()
    .post(
      '/api/tts/synthesize',
      validator('json', (value) => value as Record<string, unknown>),
      async (c) => {
        try {
          const body = c.req.valid('json');
          const provider = String(body.provider || '');
          const text = String(body.text || '');
          const trackLanguage =
            typeof body.trackLanguage === 'string' ? body.trackLanguage : undefined;
          const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl : undefined;
          const region = typeof body.region === 'string' ? body.region : undefined;
          const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined;
          const voice = typeof body.voice === 'string' ? body.voice : undefined;
          const model = typeof body.model === 'string' ? body.model : undefined;
          const rate = typeof body.rate === 'number' ? body.rate : undefined;
          const style = typeof body.style === 'string' ? body.style : undefined;
          const gender =
            body.gender === 'MALE' || body.gender === 'FEMALE'
              ? (body.gender as 'MALE' | 'FEMALE')
              : undefined;
          const res = await synthesizeViaProxy({
            provider,
            text,
            ...(trackLanguage ? { trackLanguage } : {}),
            ...(baseUrl ? { baseUrl } : {}),
            ...(region ? { region } : {}),
            ...(apiKey ? { apiKey } : {}),
            ...(voice ? { voice } : {}),
            ...(model ? { model } : {}),
            ...(rate !== undefined ? { rate } : {}),
            ...(style ? { style } : {}),
            ...(gender ? { gender } : {}),
          });
          if (!isOk(res)) return formatBusinessErrorResponse(c, res.error);
          return new Response(res.value.audio as BodyInit, {
            headers: { 'Content-Type': res.value.contentType },
          });
        } catch (e) {
          return formatBusinessErrorResponse(c, e, 'synthesizeViaProxy');
        }
      }
    )
    .post(
      '/api/tts/validate',
      validator('json', (value) => value as Record<string, unknown>),
      async (c) => {
        try {
          const body = c.req.valid('json');
          const provider = String(body.provider || '');
          const trackLanguage =
            typeof body.trackLanguage === 'string' ? body.trackLanguage : undefined;
          const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl : undefined;
          const region = typeof body.region === 'string' ? body.region : undefined;
          const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined;
          const voice = typeof body.voice === 'string' ? body.voice : undefined;
          const model = typeof body.model === 'string' ? body.model : undefined;
          const style = typeof body.style === 'string' ? body.style : undefined;
          const res = await validateProxyCredentials({
            provider,
            text: '',
            ...(trackLanguage ? { trackLanguage } : {}),
            ...(baseUrl ? { baseUrl } : {}),
            ...(region ? { region } : {}),
            ...(apiKey ? { apiKey } : {}),
            ...(voice ? { voice } : {}),
            ...(model ? { model } : {}),
            ...(style ? { style } : {}),
          });
          if (!isOk(res)) return formatBusinessErrorResponse(c, res.error);
          return c.json(res.value);
        } catch (e) {
          return formatBusinessErrorResponse(c, e, 'validateProxyCredentials');
        }
      }
    )
    .post(
      '/api/tts/voices',
      validator('json', (value) => value as Record<string, unknown>),
      async (c) => {
        try {
          const body = c.req.valid('json');
          const provider = String(body.provider || '');
          const trackLanguage =
            typeof body.trackLanguage === 'string' ? body.trackLanguage : undefined;
          const region = typeof body.region === 'string' ? body.region : undefined;
          const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined;
          const res = await listProxyVoices({
            provider,
            ...(region ? { region } : {}),
            ...(apiKey ? { apiKey } : {}),
            ...(trackLanguage ? { trackLanguage } : {}),
          });
          if (!isOk(res)) return formatBusinessErrorResponse(c, res.error);
          return c.json(res.value);
        } catch (e) {
          return formatBusinessErrorResponse(c, e, 'listProxyVoices');
        }
      }
    );
}
