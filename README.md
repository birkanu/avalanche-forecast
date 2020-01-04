# Avalanche Forecast: An Alexa Skill

This repository contains code for the Alexa Avalanche Forecast skill. 

To learn more about what the skill does, please check out [Avalanche Forecast at Amazon](https://www.amazon.com/Birkan-Uzun-Avalanche-Forecast/dp/B08393LTZ8/ref=sr_1_1?keywords=Avalanche+Forecast&qid=1578097620&s=digital-skills&sr=1-1).

# Contributing Guidelines

Thank you for your interest in contributing to this project. Whether it's a bug report, new feature, correction, or additional
documentation, I greatly value feedback and contributions from the community.

Please read through this document before submitting any issues or pull requests to ensure I have all the necessary
information to effectively respond to your bug report or contribution.

## Reporting Bugs/Feature Requests

Please use the GitHub issue tracker to report bugs or suggest features.

When filing an issue, please check [existing open](https://github.com/birkanu/avalanche-forecast/issues), or [recently closed](https://github.com/birkanu/avalanche-forecast/issues?utf8=%E2%9C%93&q=is%3Aissue%20is%3Aclosed%20), issues to make sure somebody else hasn't already
reported the issue. Please try to include as much information as you can. Details like these are incredibly useful:

* A reproducible test case or series of steps
* The version of our code being used
* Any modifications you've made relevant to the bug
* Anything unusual about your environment or deployment

## Contributing via Pull Requests
Contributions via pull requests are much appreciated. Before sending a pull request, please ensure that:

1. You are working against the latest source on the *master* branch.
2. You check existing open, and recently merged, pull requests to make sure someone else hasn't addressed the problem already.
3. You open an issue to discuss any significant work - I would hate for your time to be wasted.

To send a pull request, please:

1. Fork the repository.
2. Modify the source; please focus on the specific change you are contributing. If you also reformat all the code, it will be hard for me to focus on your change.
3. Make sure you have tested the skill by deploying it through the [Alexa Skills Kit Developer Console](https://developer.amazon.com/alexa/console/ask), speaking sample utterances and validating that you get proper responses. If you haven't done this before, please check out the **Resources** section below to learn how Alexa skills work.
4. Commit to your fork using clear commit messages.
5. Send me a pull request, answering any default questions in the pull request interface.
6. Pay attention to any automated CI failures reported in the pull request, and stay involved in the conversation.

GitHub provides additional document on [forking a repository](https://help.github.com/articles/fork-a-repo/) and
[creating a pull request](https://help.github.com/articles/creating-a-pull-request/).

# Resources

* [Alexa Skills Kit](https://developer.amazon.com/alexa-skills-kit)
* [Alexa Hosted Skills](https://developer.amazon.com/docs/hosted-skills/build-a-skill-end-to-end-using-an-alexa-hosted-skill.html)
* [Intents, Utterances, Slots](https://developer.amazon.com/docs/custom-skills/create-intents-utterances-and-slots.html)
* [Auto Delegation](https://developer.amazon.com/docs/custom-skills/delegate-dialog-to-alexa.html#automatically-delegate-simple-dialogs-to-alexa)
* [Ask NodeJS SDK](https://ask-sdk-for-nodejs.readthedocs.io/en/latest/)
* [Persistent Attributes](https://ask-sdk-for-nodejs.readthedocs.io/en/latest/Managing-Attributes.html) with [Amazon S3](https://aws.amazon.com/s3/)
* [Alexa Settings API](https://developer.amazon.com/docs/smapi/alexa-settings-api-reference.html)
* [Amazon Developer Forums](https://forums.developer.amazon.com/spaces/165/index.html)