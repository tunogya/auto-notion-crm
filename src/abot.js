const dotenv = require('dotenv');
const NotionManager = require("./notion");
const Auth0Manager = require("./auth0");
const DynamoDBManager = require("./dynamoDB");
dotenv.config();

class Abot {
  constructor() {
    this.notion = new NotionManager({
      auth: process.env.NOTION_TOKEN,
    })
    this.auth0 = new Auth0Manager()
    this.ddb = new DynamoDBManager()
  }
  
  // get all users from Auth0 and sync them to Notion
  async syncAuth0UserDataToNotion() {
    const users = await this.auth0.getUsersFromAuth0();
    for (const user of users) {
      const notionUser = await this.notion.getUserInfoFromNotion(user);
      if (notionUser) {
        await this.notion.updateNotionUserInfoFromAuth0(notionUser.id, user);
      } else {
        await this.notion.postCRMUserInfoFromAuth0Data(user);
      }
    }
  }
  
  async syncMetadataToNotion() {
    // get all users from notion
    const users = await this.notion.getAllCRMUsers();
    for (const user of users) {
      const page_id = user.id
      const user_id = user.properties['User Id'].rich_text[0].plain_text;
      if (!user_id || !page_id) {
        continue;
      }
      // get user metadata from dynamodb
      const metadata = await this.ddb.getUserMetadataFromDDB(user_id);
      await this.ddb.updatePageIdToMetadata(user_id, page_id);
      if (metadata) {
        const paidUseTTL = metadata?.paidUseTTL || 0;
        const freeUseTTL = metadata?.freeUseTTL || 0;
        if (paidUseTTL === 0 && freeUseTTL === 0) {
          continue;
        }
        const freeExpiration = new Date(freeUseTTL * 1000).toISOString();
        const paidExpiration = new Date(paidUseTTL * 1000).toISOString();
        await this.notion.updateCRMUserMetadata(page_id, freeExpiration, paidExpiration);
      }
    }
  }
  
  async syncCDKeysToNotion() {
    const cdkeys = await this.ddb.getAllCDKeyFromDDB();
    for (const cdkey of cdkeys) {
      const page = await this.notion.getCDKeyFromNotion(cdkey);
      if (!page) {
        await this.notion.postCDKeysByDDB(cdkey);
      } else {
        await this.notion.updateCDKeysByDDB(page.id, cdkey);
      }
    }
  }
}

(async () => {
  const abot = new Abot();
  await abot.syncAuth0UserDataToNotion();
  await abot.syncMetadataToNotion();
  await abot.syncCDKeysToNotion();
})();
