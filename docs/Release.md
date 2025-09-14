# Create GitHub Actions Directory Structure 
```
.github/
└── workflows/
    └── release.yml
```

# Set Up Token & Package
## Set Up Token
### Generate NPM Token
Go to npmjs.com and log in
Click on your profile → "Access Tokens"
Click "Generate New Token" → "Automation"
Copy the generated token

###  Add NPM Token to GitHub Secret
Go to your GitHub repository
Navigate to Settings → Secrets and Variables → Actions
Click "New repository secret"
Name: NPM_TOKEN
Value: Paste your NPM token
Click "Add secret"