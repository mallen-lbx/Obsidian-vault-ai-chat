# 🎯 Vault AI Chat - Installation Guide

## Do I Need to Build Anything?

**NO!** The release zip (`vault-ai-chat-release.zip`) is already built and ready to use. Just copy the files and go!

You only need npm/building if you want to change the code yourself (most people don't need this).

---

## 📋 What You'll Need

1. **Obsidian** installed on your computer (download from [obsidian.md](https://obsidian.md))
2. The **vault-ai-chat-release.zip** file
3. An **API key** from one of these providers (pick one):
   - [OpenRouter](https://openrouter.ai/keys) - Easiest, works with many AI models
   - [Google AI Studio](https://aistudio.google.com) - Free tier available
   - [Ollama](https://ollama.ai) - Free, runs on your computer, no internet needed
   - [Z.AI](https://z.ai) - For GLM models
   - [MiniMax](https://platform.minimax.io) - For MiniMax models

---

## 🚀 Installation Steps (No Building Required!)

### Step 1: Find Your Obsidian Vault Folder

Your "vault" is just a folder on your computer where Obsidian stores all your notes.

**How to find it:**
1. Open Obsidian
2. Look at the bottom-left corner - you'll see your vault name
3. Click on the vault name → "Open folder"
4. This opens your vault folder in File Explorer (Windows) or Finder (Mac)

**Or find it manually:**
- **Windows:** Usually in `C:\Users\YourName\Documents\` or wherever you created it
- **Mac:** Usually in `/Users/YourName/Documents/` or wherever you created it

### Step 2: Find or Create the Plugins Folder

Inside your vault folder, you need to find a hidden folder called `.obsidian`:

**On Windows:**
1. Open your vault folder
2. Click "View" in the menu bar
3. Check the box that says "Hidden items"
4. Now you can see the `.obsidian` folder - open it
5. Look for a folder called `plugins` - if it doesn't exist, create it

**On Mac:**
1. Open your vault folder in Finder
2. Press `Cmd + Shift + .` (period) to show hidden files
3. Now you can see the `.obsidian` folder - open it
4. Look for a folder called `plugins` - if it doesn't exist, create it

### Step 3: Create the Plugin Folder

1. Inside the `plugins` folder, create a new folder
2. Name it exactly: `vault-ai-chat`

So your folder path should look like this:
```
Your Vault/
└── .obsidian/
    └── plugins/
        └── vault-ai-chat/    ← Create this folder
```

### Step 4: Extract the Plugin Files

1. Find the `vault-ai-chat-release.zip` file you downloaded
2. Open/extract the zip file
3. You'll see 3 files inside:
   - `main.js`
   - `manifest.json`
   - `styles.css`
4. Copy ALL 3 files into the `vault-ai-chat` folder you created

Your folder should now look like this:
```
Your Vault/
└── .obsidian/
    └── plugins/
        └── vault-ai-chat/
            ├── main.js        ← Copy this here
            ├── manifest.json  ← Copy this here
            └── styles.css     ← Copy this here
```

### Step 5: Enable the Plugin in Obsidian

1. Open Obsidian (or restart it if it was already open)
2. Click the **gear icon** ⚙️ in the bottom-left corner to open Settings
3. In the left sidebar, click **"Community plugins"**
4. If you see a message about "Restricted mode", click **"Turn on community plugins"**
5. Click the **"Reload plugins"** button (looks like a refresh icon)
6. Find **"Vault AI Chat"** in the list
7. Toggle the switch ON to enable it

### Step 6: Set Up Your AI Provider

1. Still in Settings, scroll down in the left sidebar
2. Click **"Vault AI Chat"** (under Plugin Options)
3. Choose your **Provider** from the dropdown (e.g., "OpenRouter")
4. Enter your **API Key** in the text box
5. Click the **"Test"** button to make sure it works
   - ✅ If you see "Connection successful!" - you're good!
   - ❌ If you see an error, double-check your API key

### Step 7: Start Chatting!

1. Close the Settings window
2. Look for the **chat bubble icon** 💬 in the left sidebar (ribbon)
3. Click it to open the chat panel
4. Type a question about your notes and press Enter!

---

## 🔑 Getting API Keys (Pick One)

### Option A: OpenRouter (Recommended for Beginners)

OpenRouter is the easiest because it gives you access to many AI models with one key.

1. Go to [openrouter.ai](https://openrouter.ai)
2. Click "Sign Up" and create an account
3. After signing in, go to [openrouter.ai/keys](https://openrouter.ai/keys)
4. Click "Create Key"
5. Copy the key (starts with `sk-or-...`)
6. Paste it in the plugin settings

**Cost:** Pay-per-use, usually a few cents per conversation

### Option B: Google AI (Free Tier Available)

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with your Google account
3. Click "Get API Key" in the left sidebar
4. Click "Create API Key"
5. Copy the key
6. Paste it in the plugin settings
7. In the plugin, select "Google AI (Gemini)" as your provider

**Cost:** Free tier with limits, then pay-per-use

### Option C: Ollama (100% Free, Runs Locally)

Ollama runs AI models on your own computer - no internet needed, completely private!

1. Go to [ollama.ai](https://ollama.ai)
2. Click "Download" and install Ollama for your computer
3. Open Terminal (Mac) or Command Prompt (Windows)
4. Type: `ollama pull llama3.2` and press Enter (this downloads a model)
5. Keep Ollama running in the background
6. In the plugin settings:
   - Select "Ollama (Local)" as your provider
   - Set the URL to `http://localhost:11434`
   - Set the model to `llama3.2`

**Cost:** Completely free! Uses your computer's resources.

---

## 🎮 How to Use the Plugin

### Basic Chat
1. Click the 💬 chat icon in the left ribbon
2. Type your question in the box at the bottom
3. Press Enter or click the send button
4. The AI will search your notes and answer with sources!

**Example questions:**
- "What do my notes say about machine learning?"
- "Summarize my notes on Project X"
- "What are the key points from my meeting notes?"

### Generate Enhanced Notes
1. Open any note in your vault
2. Select some text (or use the whole note)
3. Press `Ctrl+P` (Windows) or `Cmd+P` (Mac) to open the Command Palette
4. Type "enhance" and select one of these commands:
   - **Generate enhanced note from selection** - Creates a note from selected text
   - **Generate enhanced note from current file** - Creates a note from the whole file
5. Choose what type of note you want:
   - **Summary** - Main points and key ideas
   - **Analysis** - Deep examination with insights
   - **Outline** - Organized with headers and bullets
   - **Study Guide** - Questions and terms to review
   - **Action Items** - Extracted tasks and to-dos

### Save Your Chats
- Click the **save icon** 💾 in the chat header to save the conversation
- Chats are saved as Markdown files in your "AI Chats" folder
- You can review old conversations anytime!

---

## ❓ Troubleshooting

### "No AI provider configured"
→ You need to add an API key in Settings → Vault AI Chat

### "Connection failed" or "Invalid API key"
→ Double-check that you copied the entire API key correctly
→ Make sure you selected the right provider

### Plugin doesn't show up
→ Make sure all 3 files (main.js, manifest.json, styles.css) are in the folder
→ Try clicking "Reload plugins" in Community plugins settings
→ Restart Obsidian completely

### "Cannot connect to Ollama"
→ Make sure Ollama is running (open it from your applications)
→ Try running `ollama serve` in Terminal/Command Prompt

### Chat is slow
→ This is normal! AI takes a few seconds to think
→ Streaming shows words as they're generated

### Nothing happens when I click the chat icon
→ The chat panel might have opened on the right side - look there!
→ Try dragging the right edge of the window to expand it

---

## 🎉 You're Done!

That's it! You now have an AI assistant that knows your notes. Ask it anything about your vault and it will find relevant information and cite its sources.

**Tips for best results:**
- Ask specific questions about topics in your notes
- The more notes you have, the better the answers
- Use the "Generate enhanced note" feature to create summaries automatically

---

## 📞 Need Help?

If something isn't working:
1. Re-read the steps above carefully
2. Make sure all files are in the right place
3. Try restarting Obsidian
4. Check that your API key is correct

Happy note-taking! 📝✨
