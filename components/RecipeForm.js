import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

const RecipeForm = ({ recipes, setRecipes, addRecipe, cancelForm, editingRecipe, setEditingRecipe }) => {
  const [recipeName, setRecipeName] = useState(editingRecipe ? editingRecipe.name : '');
  const [steps, setSteps] = useState(editingRecipe ? editingRecipe.steps : [{ description: '', duration: 0, autoTransition: false }]);

  const updateStep = (index, key, value) => {
    setSteps((prevSteps) =>
      prevSteps.map((step, idx) => (idx === index ? { ...step, [key]: value } : step))
    );
  };

  const addStep = () => {
    setSteps((prevSteps) => [...prevSteps, { description: '', duration: 0, autoTransition: false }]);
  };

  const removeStep = (index) => {
    setSteps((prevSteps) => prevSteps.filter((_, idx) => idx !== index));
  };

  const resetForm = () => {
    setRecipeName('');
    setSteps([{ description: '', duration: 0, autoTransition: false }]);
  };

  const submitForm = () => {
    if (recipeName === '') {
      alert('Please enter a recipe name.');
      return;
    }

    if (editingRecipe) {
      const updatedRecipes = recipes.map((recipe) =>
        recipe.id === editingRecipe.id ? { id: editingRecipe.id, name: recipeName, steps } : recipe
      );
      setRecipes(updatedRecipes);
      setEditingRecipe(null);
    } else {
      const newRecipe = { name: recipeName, steps };

      addRecipe(newRecipe);
    }
    resetForm();
  };

  const cancelFormHandler = () => {
    cancelForm();
  };

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
      }}
    >
      <Text style={styles.label}>Recipe Name:</Text>
      <TextInput
        style={styles.textInput}
        value={recipeName}
        onChangeText={setRecipeName}
        placeholder="Enter recipe name"
      />

      {steps.map((step, index) => (
        <View key={index} style={styles.stepContainer}>
          <Text style={styles.label}>Step {index + 1}:</Text>
          <TextInput
            style={styles.textInput}
            value={step.description}
            onChangeText={(text) => updateStep(index, 'description', text)}
            placeholder="Enter step description"
          />
          <Text style={styles.label}>Duration (seconds):</Text>
          <TextInput
            style={styles.textInput}
            keyboardType="number-pad"
            value={step.duration.toString()}
            onChangeText={(text) => updateStep(index, 'duration', parseInt(text) || 0)}
            placeholder="Enter duration in seconds"
          />
          <Text style={styles.label}>Auto-transition:</Text>
          <TouchableOpacity
            style={styles.checkbox}
            onPress={() => updateStep(index, 'autoTransition', !step.autoTransition)}
          >
            <Text style={styles.checkboxText}>{step.autoTransition ? '✓' : ''}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => removeStep(index)} style={styles.removeButton}>
            <Text style={styles.removeButtonText}>Remove Step</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity onPress={addStep} style={styles.addButton}>
        <Text style={styles.addButtonText}>Add Step</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={submitForm} style={styles.addButton}>
        <Text style={styles.addButtonText}>Add Recipe</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={cancelFormHandler} style={styles.cancelButton}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: 18,
    marginTop: 16,
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    width: '80%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  checkbox: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  checkboxText: {
    fontSize: 18,
  },
  stepContainer: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  addButton: {
    backgroundColor: '#4caf50',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 18,
  },
  removeButton: {
    backgroundColor: '#f44336',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 18,
  },
  cancelButton: {
    backgroundColor: '#f44336',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 18,
  },
});

export default RecipeForm;
