import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RecipeForm from './components/RecipeForm';
import Timer from './components/Timer';

const STORAGE_KEY = 'recipes';

const App = () => {
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [editingRecipe, setEditingRecipe] = useState(null);

  useEffect(() => {
    const loadRecipes = async () => {
      try {
        const storedRecipes = await AsyncStorage.getItem(STORAGE_KEY);
        if (storedRecipes) {
          setRecipes(JSON.parse(storedRecipes));
        }
      } catch (error) {
        console.error('Error loading recipes:', error);
      }
    };

    loadRecipes();
  }, []);

  const saveRecipes = async (newRecipes) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newRecipes));
      setRecipes(newRecipes);
    } catch (error) {
      console.error('Error saving recipes:', error);
    }
  };

  const handleSelectRecipe = (recipe) => {
    setSelectedRecipe(recipe);
  };

  const handleAddRecipe = () => {
    setEditingRecipe({id: Date.now(), name: '', steps:[{ description: '', duration: 0, autoNext: false, alarmBeforeEnd: false }]});
  };

  const handleSaveRecipe = (recipe) => {
    if (editingRecipe.id) {
      // Update existing recipe
      const index = recipes.findIndex((r) => r.id === editingRecipe.id);
      const updatedRecipes = [
        ...recipes.slice(0, index),
        recipe,
        ...recipes.slice(index + 1),
      ];
      saveRecipes(updatedRecipes);
    } else {
      // Add new recipe
      const newRecipe = { ...recipe, id: Date.now() };
      saveRecipes([...recipes, newRecipe]);
    }
    setEditingRecipe(null);
  };

  const handleCancelEdit = () => {
    setEditingRecipe(null);
  };

  const handleEditRecipe = (recipe) => {
    setEditingRecipe(recipe);
  };

  const handleDeleteRecipe = async (recipeId) => {
    const updatedRecipes = recipes.filter((recipe) => recipe.id !== recipeId);
    saveRecipes(updatedRecipes);
    setSelectedRecipe(null);
  };

  const handleBack = () => {
    setSelectedRecipe(null);
  };

  if (editingRecipe) {
    return (
      <RecipeForm
        initialRecipe={editingRecipe}
        onSave={handleSaveRecipe}
        onCancel={handleCancelEdit}
      />
    );
  }

  if (selectedRecipe) {
    return (
      <Timer
        recipe={selectedRecipe}
        onEdit={handleEditRecipe}
        onDelete={handleDeleteRecipe}
        onBack={handleBack}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>レシピタイマー</Text>
      <FlatList
        data={recipes}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.listItem}
            onPress={() => handleSelectRecipe(item)}
          >
            <Text style={styles.listItemText}>{item.name}</Text>
          </TouchableOpacity>
        )}
        keyExtractor={(item) => String(item.id)}
      />
      <TouchableOpacity style={styles.addButton} onPress={handleAddRecipe}>
        <Text style={styles.addButtonText}>レシピを追加</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    marginTop: 36,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  listItem: {
    padding: 10,
    backgroundColor: 'dodgerblue',
    borderRadius: 4,
    marginBottom: 10,
  },
  listItemText: {
    color: 'white',
    fontSize: 18,
  },
  addButton: {
    backgroundColor: 'dodgerblue',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    alignSelf: 'center',
    marginTop: 10,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
  },
});

export default App;