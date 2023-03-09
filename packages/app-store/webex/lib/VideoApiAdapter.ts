import { z } from "zod";

import prisma from "@calcom/prisma";
import type { Credential } from "@calcom/prisma/client";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";

import { getWebexAppKeys } from "./getWebexAppKeys";

/** @link https://developer.webex.com/docs/meetings **/
const webexEventResultSchema = z.object({
  id: z.string(),
  web_link: z.string(),
  password: z.string().optional().default(""),
});

export type WebexEventResult = z.infer<typeof webexEventResultSchema>;

/** @link https://developer.webex.com/docs/api/v1/meetings/create-a-meeting */
export const webexMeetingSchema = z.object({
  id: z.string(),
  meetingNumber: z.string(),
  title: z.string(),
  agenda: z.string(),
  password: z.string(),
  phoneAndVideoSystemPassword: z.string(),
  meetingType: z.enum(["meetingSeries", "scheduledMeeting", "meeting"]),
  state: z.enum(["active", "scheduled", "ready", "lobby", "inProgress", "ended", "missed", "expired"]),
  adhoc: z.boolean(),
  timezone: z.string(),
  start: z.date(),
  end: z.date(),
  recurrence: z.string(),
  hostUserId: z.string(),
  hostDisplayName: z.string(),
  hostEmail: z.string().email(),
  hostKey: z.string(),
  siteUrl: z.string(),
  webLink: z.string(),
  sipAddress: z.string(),
  dialInIpAddress: z.string(),
  roomId: z.string(),
  enabledAutoRecordMeeting: z.boolean(),
  allowAnyUserToBeCoHost: z.boolean(),
  enabledJoinBeforeHost: z.boolean(),
  enableConnectAudioBeforeHost: z.boolean(),
  joinBeforeHostMinutes: z.number(),
  excludePassword: z.boolean(),
  publicMeeting: z.boolean(),
  reminderTime: z.number(),
  unlockedMeetingJoinSecurity: z.enum(["allowJoin", "allowJoinWithLobby", "blockFromJoin"]),
  sessionTypeId: z.number(),
  scheduledType: z.enum(["meeting", "webinar", "personalMeetingRoom"]),
  enabledWebcastView: z.boolean(),
  panelistPassword: z.string(),
  phoneAndVideoSystemPanelistPassword: z.string(),
  enableAutomaticLock: z.boolean(),
  automaticLockMinutes: z.number(),
  allowFirstUserToBeCoHost: z.boolean(),
  allowAuthenticatedDevices: z.boolean(),
  telephony: z.object({
    accessCode: z.string(),
    callInNumbers: z.array(
      z.object({
        label: z.string(),
        callInNumber: z.string(),
        tollType: z.enum(["toll", "tollFree"]),
      })
    ),
    links: z.array(z.object({ rel: z.string(), href: z.string(), method: z.string() })),
  }),
  meetingOptions: z.object({
    enabledChat: z.boolean(),
    enabledVideo: z.boolean(),
    enabledPolling: z.boolean(),
    enabledNote: z.boolean(),
    noteType: z.enum(["allowAll", "allowOne"]),
    enabledClosedCaptions: z.boolean(),
    enabledFileTransfer: z.boolean(),
    enabledUCFRichMedia: z.boolean(),
  }),
  attendeePrivileges: z.object({
    enabledShareContent: z.boolean(),
    enabledSaveDocument: z.boolean(),
    enabledPrintDocument: z.boolean(),
    enabledAnnotate: z.boolean(),
    enabledViewParticipantList: z.boolean(),
    enabledViewThumbnails: z.boolean(),
    enabledRemoteControl: z.boolean(),
    enabledViewAnyDocument: z.boolean(),
    enabledViewAnyPage: z.boolean(),
    enabledContactOperatorPrivately: z.boolean(),
    enabledChatHost: z.boolean(),
    enabledChatPresenter: z.boolean(),
    enabledChatOtherParticipants: z.boolean(),
  }),
  registration: z.object({
    autoAcceptRequest: z.boolean(),
    requireFirstName: z.boolean(),
    requireLastName: z.boolean(),
    requireEmail: z.boolean(),
    requireJobTitle: z.boolean(),
    requireCompanyName: z.boolean(),
    requireAddress1: z.boolean(),
    requireAddress2: z.boolean(),
    requireCity: z.boolean(),
    requireState: z.boolean(),
    requireZipCode: z.boolean(),
    requireCountryRegion: z.boolean(),
    requireWorkPhone: z.boolean(),
    requireFax: z.boolean(),
    maxRegisterNum: z.number(),
  }),
  integrationTags: z.array(z.string()),
  simultaneousInterpretation: z.object({
    enabled: z.boolean(),
    interpreters: z.array(
      z.object({
        id: z.string(),
        languageCode1: z.string(),
        languageCode2: z.string(),
        email: z.string().email(),
        displayName: z.string(),
      })
    ),
  }),
  trackingCodes: z.array(z.object({ name: z.string(), value: z.string() })),
  audioConnectionOptions: z.object({
    audioConnectionType: z.string(),
    enabledTollFreeCallIn: z.boolean(),
    enabledGlobalCallIn: z.boolean(),
    enabledAudienceCallBack: z.boolean(),
    entryAndExitTone: z.string(),
    allowHostToUnmuteParticipants: z.boolean(),
    allowAttendeeToUnmuteSelf: z.boolean(),
    muteAttendeeUponEntry: z.boolean(),
  }),
});

/** @link https://developer.webex.com/docs/api/v1/meetings/list-meetings */
export const webexMeetingsSchema = z.object({
  items: z.array(
    webexMeetingSchema.extend({
      meetingSeriesId: z.string(),
      isModified: z.boolean(),
      enabledBreakoutSessions: z.boolean(),
    })
  ),
});

/** @link https://developer.webex.com/docs/integrations#getting-an-access-token */
const webexTokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string(),
  refresh_token_expires_in: z.number(),
  expiry_date: z.number(),
});
type WebexToken = z.infer<typeof webexTokenSchema>;
const isTokenValid = (token: WebexToken) => (token.expires_in || token.expiry_date) < Date.now();

/** @link https://developer.webex.com/docs/integrations#using-the-refresh-token */
const webexRefreshedTokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expiry_date: z.number(),
  expires_in: z.number(),
  refresh_token_expires_in: z.number(),
});

const webexAuth = (credential: CredentialPayload) => {
  const refreshAccessToken = async (refreshToken: string) => {
    const { client_id, client_secret } = await getWebexAppKeys();

    const response = await fetch("https://webexapis.com/v1/access_token", {
      method: "POST",
      headers: {
        "Content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: client_id,
        client_secret: client_secret,
        refresh_token: refreshToken,
      }),
    });

    const responseBody = await handleWebexResponse(response, credential.id);

    if (responseBody.error) {
      if (responseBody.error === "invalid_grant") {
        return Promise.reject(new Error("Invalid grant for Cal.com webex app"));
      }
    }
    // We check the if the new credentials matches the expected response structure
    const parsedToken = webexRefreshedTokenSchema.safeParse(responseBody);
    if (!parsedToken.success) {
      return Promise.reject(new Error("Invalid refreshed tokens were returned"));
    }
    const newTokens = parsedToken.data;
    const oldCredential = await prisma.credential.findUniqueOrThrow({ where: { id: credential.id } });
    const parsedKey = webexTokenSchema.safeParse(oldCredential.key);
    if (!parsedKey.success) {
      return Promise.reject(new Error("Invalid credentials were saved in the DB"));
    }

    const key = parsedKey.data;
    key.access_token = newTokens.access_token;
    key.refresh_token = newTokens.refresh_token;
    // set expiry date as offset from current time.
    key.expiry_date = Math.round(Date.now() + newTokens.expires_in * 1000);
    // Store new tokens in database.
    await prisma.credential.update({ where: { id: credential.id }, data: { key } });
    return newTokens.access_token;
  };
  return {
    getToken: async () => {
      let credentialKey: WebexToken | null = null;
      try {
        credentialKey = webexTokenSchema.parse(credential.key);
      } catch (error) {
        return Promise.reject("Webex credential keys parsing error");
      }

      return !isTokenValid(credentialKey)
        ? Promise.resolve(credentialKey.access_token)
        : refreshAccessToken(credentialKey.refresh_token);
    },
  };
};
const WebexVideoApiAdapter = (credential: CredentialPayload): VideoApiAdapter => {
  //TODO implement translateEvent for recurring events
  const translateEvent = async (event: CalendarEvent) => {
    //TODO
    return event;
  };

  const fetchWebexApi = async (endpoint: string, options?: RequestInit) => {
    const auth = webexAuth(credential);
    const accessToken = await auth.getToken();
    const response = await fetch(`https://webexapis.com/v1/${endpoint}`, {
      method: "GET",
      ...options,
      headers: {
        Authorization: "Bearer " + accessToken,
        ...options?.headers,
      },
    });
    const responseBody = await handleWebexResponse(response, credential.id);
    return responseBody;
  };

  return {
    getAvailability: async () => {
      try {
        const responseBody = await fetchWebexApi("meetings");

        const data = webexMeetingsSchema.parse(responseBody);
        return data.items.map((meeting) => ({
          start: meeting.start,
          end: meeting.end,
        }));
      } catch (err) {
        console.error(err);

        return [];
      }
    },
    createMeeting: async (event: CalendarEvent): Promise<VideoCallData> => {
      //TODO
      return {
        type: "webex_video",
        id: "123", //TODO
        url: "https://webex.com", //TODO
        password: "123", //TODO
      };
    },
    deleteMeeting: async (uid: string): Promise<void> => {
      try {
        await fetchWebexApi(`meetings/${uid}`, {
          method: "DELETE",
        });
        return Promise.resolve();
      } catch (err) {
        return Promise.reject(new Error("Failed to delete meeting"));
      }
    },
    updateMeeting: async (event: CalendarEvent): Promise<VideoCallData> => {
      //TODO
      return {
        type: "webex_video",
        id: "123", //TODO
        url: "https://webex.com", //TODO
        password: "123", //TODO
      };
    },
  };
};

const handleWebexResponse = async (response: Response, credentialId: Credential["id"]) => {
  let _response = response.clone();
  const responseClone = response.clone();
  if (_response.headers.get("content-encoding") === "gzip") {
    const responseString = await response.text();
    _response = JSON.parse(responseString);
  }
  if (!response.ok || (response.status < 200 && response.status >= 300)) {
    const responseBody = await _response.json();

    if ((response && response.status === 124) || responseBody.error === "invalid_grant") {
      await invalidateCredential(credentialId);
    }
    throw Error(response.statusText);
  }
  // handle 204 response code with empty response (causes crash otherwise as "" is invalid JSON)
  if (response.status === 204) {
    return;
  }
  return responseClone.json();
};

const invalidateCredential = async (credentialId: Credential["id"]) => {
  const credential = await prisma.credential.findUnique({
    where: {
      id: credentialId,
    },
  });

  if (credential) {
    await prisma.credential.update({
      where: {
        id: credentialId,
      },
      data: {
        invalid: true,
      },
    });
  }
};
export default WebexVideoApiAdapter;