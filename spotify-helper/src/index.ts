import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import {
  defineDAINService,
  ToolConfig,
} from "@dainprotocol/service-sdk";
import { CardUIBuilder, ImageCardUIBuilder } from "@dainprotocol/utils";
import { OAuth2Tokens } from "@dainprotocol/service-sdk";
import { createOAuth2Tool } from "@dainprotocol/service-sdk";
import dotenv from 'dotenv';
import * as fs from 'fs/promises';

dotenv.config(); // Load environment variables

const execAsync = promisify(exec);


const getArtistInfo: ToolConfig = {
  id: "get-info",
  name: "Get Artist Info",
  description: "Fetches listed artist about the artist",
  input: z
      .object({
          artist: z.string().describe("Artist spotify id"),
      })
      .describe("Input parameters for the spotify request"),
  output: z
      .object({
          name: z.string().describe("Information about artist"),
          followers: z.number().describe("Followers of the artist"),
          genres: z.array(z.string()).describe("Genres of the artist"),
          popularity: z.number().describe("Popularity of the artist"),
          image: z.string().describe("Image URL of the artist"),
          // artist_info: z.string().describe("Information about artist"),
      })
      .describe("Aritist information"),
  pricing: { pricePerUse: 0, currency: "USD" },
  handler: async ({ artist }, agentInfo, context) => {
      try {
        console.log(`User / Agent ${agentInfo.id} requested artist info from ${artist}`);
        const { stdout, stderr } = await execAsync(`python3 apis/get_info.py "${artist}"`);
        if (stderr) {
            throw new Error(stderr);
        }

        const artist_info_json = await fs.readFile(`apis/artist_info.json`, 'utf8');
        const artist_info = JSON.parse(artist_info_json);
        console.log(artist_info);
        if (!artist_info) {
            throw new Error("No genres found for the artist.");
        }
        const artist_name = artist_info.name;
        const artist_followers = artist_info.followers;
        const artist_genres = artist_info.genres;
        const artist_popularity = artist_info.popularity;
        const imageURL = artist_info.image;

        const formattedGenres = artist_genres
          .map((genre: string) => genre.charAt(0).toUpperCase() + genre.slice(1)) // Capitalize each genre
          .join(", ");
        const formattedFollowers = artist_followers.toLocaleString();

        console.log(artist_name, artist_genres, artist_popularity);


        return {
            // text: artist_info,
            text: "Artist information",
            data: { 
                name: artist_name,
                followers: artist_followers,
                genres: artist_genres,
                popularity: artist_popularity,
                image: imageURL
             },
            ui: new CardUIBuilder()
              .setRenderMode("page")  
              .title(`Artist information`)
              .addChild(
                new ImageCardUIBuilder(imageURL) 
                  .aspectRatio("square")
                  .title(`${artist_name}`)
                  .description(`Followers: ${formattedFollowers}\nGenres: ${formattedGenres}\nPopularity: ${artist_popularity}`)
                  .imageAlt(`Artist Image`)
                  .build()
              )
              .build(),
        };
      } catch (error) {
          console.error("Error executing Python script:", error);
          return {
              text: "An error occurred while fetching the info.",
              data: { genres: "Error: Unable to fetch spotify data." + error },
              ui: new CardUIBuilder()
                  .title("Error")
                  .content("Unable to fetch spotify data.")
                  .build(),
          };
      }
  },
};

const getArtistGenres: ToolConfig = {
    id: "get-genres",
    name: "Get Artist Genres",
    description: "Fetches listed genres of an artist",
    input: z
        .object({
            artist: z.string().describe("Artist spotify id"),
        })
        .describe("Input parameters for the spotify request"),
    output: z
        .object({
            genres: z.string().describe("Genres of the artist"),
        })
        .describe("Genre information"),
    pricing: { pricePerUse: 0, currency: "USD" },
    handler: async ({ artist }, agentInfo, context) => {
      console.log(
        `User / Agent ${agentInfo.id} requested genres from ${artist})`
      );
        try {
          console.log(`User / Agent ${agentInfo.id} requested genres at ${artist}`);
          const { stdout, stderr } = await execAsync(`python3 apis/get_genres.py "${artist}"`);
          // const apiResponse = await axios.get(
          //   `https://api.spotify.com/v1/search?q=${artist}&type=artist&limit=1`,
          //   {
          //     headers: {
          //       Authorization: `Bearer ${process.env.SPOTIFY_ACCESS_TOKEN}`, // Use the access token
          //       "Content-Type": "application/json",
          //     },
          //   }
          // );

          // const { genres } = apiResponse.data.artists.items[0];

          if (stderr) {
              throw new Error(stderr);
          }

          const genres = stdout.trim();
          if (!genres) {
              throw new Error("No genres found for the artist.");
          }

          return {
              text: genres,
              data: { genres },
              ui: new CardUIBuilder()
                  .title(`Artist genres`)
                  .content(genres)
                  .build(),
          };
        } catch (error) {
            console.error("Error executing Python script:", error);
            return {
                text: "An error occurred while fetching the info.",
                data: { genres: "Error: Unable to fetch spotify data." + error },
                ui: new CardUIBuilder()
                    .title("Error")
                    .content("Unable to fetch spotify data.")
                    .build(),
            };
        }
    },
};

const tokenStore = new Map<string, OAuth2Tokens>();

const dainService = defineDAINService({
  metadata: {
    title: "Spotify DAIN Service",
    description: "A DAIN service for getting info on things related to Spotify with Spotify API",
    version: "1.0.0",
    author: "Your Name",
    tags: ["artists", "music", "dain"],
    },

  identity: {
    apiKey: process.env.DAIN_API_KEY,
    },
    oauth2: {
    baseUrl: process.env.TUNNEL_URL, // Use the TUNNEL_URL from .env
    providers: {
      spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        authorizationUrl: "https://accounts.spotify.com/authorize",
        tokenUrl: "https://accounts.spotify.com/api/token",
        scopes: [
          "user-read-private", 
          "user-read-email", 
          "playlist-read-private", // Example: Access private playlists
          "user-library-read",    // Example: Access user's saved tracks and albums
          "user-top-read"         // Example: Access user's top artists and tracks],
        ],
            onSuccess: async (agentId, tokens) => {
                tokenStore.set(agentId, tokens);
                console.log(`Tokens stored for agent: ${agentId}`);
          // Store tokens securely
        }
      }
    }
  },
    tools: [createOAuth2Tool("spotify"), getArtistInfo, getArtistGenres],
});

dainService.startNode().then(({ address }) => {
  console.log("DAIN Service is running at :" + address().port);
});
