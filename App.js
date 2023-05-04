import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RecipeForm from './components/RecipeForm';
import Timer from './components/Timer';

const App = () => {
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);

  useEffect(() => {
    (async () => {
      const storedRecipes = await AsyncStorage.getItem('recipes');
      if (storedRecipes) {
        setRecipes(JSON.parse(storedRecipes));
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      await AsyncStorage.setItem('recipes', JSON.stringify(recipes));
    })();
  }, [recipes]);

  const addRecipe = (recipe) => {
    recipe.id = Date.now();
    setRecipes([...recipes, recipe]);
    setShowForm(false);
  };

  const selectRecipe = (recipe) => {
    setSelectedRecipe(recipe);
  };

  const showFormHandler = () => {
    setShowForm(true);
  };

  const cancelFormHandler = () => {
    setShowForm(false);
    setEditingRecipe(null);
  };

  const editRecipe = (recipe) => {
    setSelectedRecipe(null);
    setEditingRecipe(recipe);
  };

  const removeRecipe = (recipeToRemove) => {
    setRecipes(recipes.filter((recipe) => recipe.id !== recipeToRemove.id));
    setSelectedRecipe(null);
  };

  if (showForm) {
    return <RecipeForm addRecipe={addRecipe} cancelForm={cancelFormHandler} />;
  }

  if (selectedRecipe !== null) {
    return (
      <View style={styles.container}>
        <Timer recipe={selectedRecipe} editRecipe={editRecipe} removeRecipe={removeRecipe} goBack={() => setSelectedRecipe(null)}/>
      </View>
    );
  }

  if (editingRecipe !== null) {
    return (
      <RecipeForm
        recipes={recipes}
        setRecipes={setRecipes}
        editingRecipe={editingRecipe}
        setEditingRecipe={setEditingRecipe}
        cancelForm={cancelFormHandler}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
      }}
    >
      {recipes.map((recipe, index) => (
        <TouchableOpacity key={index} onPress={() => selectRecipe(recipe)}>
          <Text style={styles.recipeText}>{recipe.name}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={showFormHandler} style={styles.addButton}>
        <Text style={styles.addButtonText}>Add Recipe</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  recipeText: {
    fontSize: 20,
    marginBottom: 16,
  },
  addButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 18,
  },
});

export default App;
