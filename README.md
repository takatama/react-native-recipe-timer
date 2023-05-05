# Recipe Timer

Recipe Timer is a countdown timer for working according to recipes. Each step in the recipe defines a "task" and the "time required" to complete it. When you select a recipe, the countdown for each step begins.

The following recipe settings are also available:
- Automatically move to the next step? (If set to No, the timer will not start the next step until you press the start button)
- Sound a time signal at the end of the step? (If set to Yes, a time signal will sound 3 seconds before the end)

## How to Use

This app consists of three screens: the top screen, the recipe timer screen, and the recipe editing screen.

When you launch the app, the top screen displays a list of recipes and an "Add Recipe" button.
- Tapping a recipe from the list will take you to the recipe timer screen for that recipe.
- Pressing the Add Recipe button will take you to the recipe editing screen.

The recipe editing screen consists of fields for the recipe name, input fields for each step, a "Save" button, and a "Cancel" button.
- The recipe name field is where you enter the name of the recipe.
- The input fields for each step include "Task", "Time Required", "Auto Next?", and "Time Signal at the End?" (only if the time required is 4 seconds or more). There are also "Delete This Step" and "Add New Step" buttons.
  - Pressing the Delete This Step button will remove the step from the recipe.
  - Pressing the Add New Step button will add a new step to the recipe and allow you to enter information for it.
- Pressing the Save button will save the edited recipe.
- Pressing the Cancel button will not save the edited recipe and return you to the previous screen (either the top screen or the timer screen).

The recipe timer screen consists of the recipe view, the timer view, "Reset All" button, and a "Back" button.
- The recipe view displays the steps of the recipe, an "Edit Recipe" button, and a "Delete Recipe" button.
  - The recipe is composed of multiple steps. Each step displays the task and the required time. The current step is shown in bold, and completed steps are shown with a strikethrough.
  - Pressing the Edit Recipe button will take you to the recipe editing screen.
  - Pressing the Delete Recipe button will delete the recipe and return you to the top screen.
- The timer view displays the remaining time for the current step, a "Start (or Pause)" button, and a "Reset" button.
  - Pressing the Start button begins the countdown for the current step and changes the text from Start to Pause. When the countdown reaches zero, the step is completed, and the app moves on to the next step. The remaining time display resets to the time for the next step, and the text changes from Pause to Start. However, if the completed step is set to "Auto Next?", the countdown for the next step will start automatically.
  - Pressing the Reset button will reset the countdown. If the Start button has changed to Pause, the text will change back to Start.
- Pressing the Reset All button will reset all completed steps to their starting state.
- Pressing the Back button will take you to the top screen.

## Specifications

- Recipes are persisted within the app.

## Limitations

- If the app is moved to the background, the timer will stop, and the countdown will not continue. You will not receive any notifications if the timer ends while the app is in the background.
- On the timer screen, users cannot move to another step while the countdown is in progress. The timer must be stopped first.
- The order of the steps in a recipe cannot be changed using drag-and-drop.
- This app is designed exclusively for smartphones.

