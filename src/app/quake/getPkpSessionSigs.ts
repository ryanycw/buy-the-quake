import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitNetwork } from "@lit-protocol/constants";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { ethers } from "ethers";
import {
  LitAbility,
  LitActionResource,
  LitPKPResource,
} from "@lit-protocol/auth-helpers";

import { type TelegramUser } from "./types";
import { litActionCode } from "./litAction";

export interface MintedPkp {
  tokenId: string;
  publicKey: string;
  ethAddress: string;
}

const { VITE_LIT_CAPACITY_CREDIT_TOKEN_ID, VITE_TELEGRAM_BOT_SECRET } =
  import.meta.env;

export const getPkpSessionSigs = async (
  telegramUser: TelegramUser,
  mintedPkp: MintedPkp
) => {
  let litNodeClient: LitNodeClient;

  try {
    console.log("🔄 Connecting to Ethereum account...");
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const ethersSigner = provider.getSigner();
    console.log(
      "✅ Connected Ethereum account:",
      await ethersSigner.getAddress()
    );

    console.log("🔄 Connecting LitNodeClient to Lit network...");
    litNodeClient = new LitNodeClient({
      litNetwork: LitNetwork.DatilTest,
      debug: true,
    });
    await litNodeClient.connect();
    console.log("✅ Connected LitNodeClient to Lit network");

    console.log("🔄 Connecting LitContracts client to network...");
    const litContracts = new LitContracts({
      signer: ethersSigner,
      network: LitNetwork.DatilTest,
      debug: false,
    });
    await litContracts.connect();
    console.log("✅ Connected LitContracts client to network");

    let capacityTokenId = VITE_LIT_CAPACITY_CREDIT_TOKEN_ID;
    if (capacityTokenId === undefined) {
      console.log("🔄 Minting Capacity Credits NFT...");
      capacityTokenId = (
        await litContracts.mintCapacityCreditsNFT({
          requestsPerKilosecond: 10,
          daysUntilUTCMidnightExpiration: 1,
        })
      ).capacityTokenIdStr;
      console.log(`✅ Minted new Capacity Credit with ID: ${capacityTokenId}`);
    } else {
      console.log(
        `ℹ️ Using provided Capacity Credit with ID: ${VITE_LIT_CAPACITY_CREDIT_TOKEN_ID}`
      );
    }

    console.log("🔄 Creating capacityDelegationAuthSig...");
    const { capacityDelegationAuthSig } =
      await litNodeClient.createCapacityDelegationAuthSig({
        dAppOwnerWallet: ethersSigner,
        capacityTokenId,
        delegateeAddresses: [mintedPkp.ethAddress],
        uses: "1",
      });
    console.log(`✅ Created the capacityDelegationAuthSig`);

    console.log(
      `🔄 Getting the Session Sigs for the PKP using Lit Action code string...`
    );
    const sessionSignatures = await litNodeClient.getPkpSessionSigs({
      pkpPublicKey: mintedPkp.publicKey,
      capabilityAuthSigs: [capacityDelegationAuthSig],
      litActionCode: Buffer.from(litActionCode).toString("base64"),
      jsParams: {
        telegramUserData: JSON.stringify(telegramUser),
        telegramBotSecret: VITE_TELEGRAM_BOT_SECRET,
        pkpTokenId: mintedPkp.tokenId,
      },
      resourceAbilityRequests: [
        {
          resource: new LitPKPResource("*"),
          ability: LitAbility.PKPSigning,
        },
        {
          resource: new LitActionResource("*"),
          ability: LitAbility.LitActionExecution,
        },
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
    });
    console.log(
      `✅ Got PKP Session Sigs: ${JSON.stringify(sessionSignatures, null, 2)}`
    );
    return sessionSignatures;
  } catch (error) {
    console.error(error);
  }
};
